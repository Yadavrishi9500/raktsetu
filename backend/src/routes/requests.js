import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { addDays, todayYmd } from '../lib/blood.js';
import { publishEvent } from '../lib/events.js';
import { HttpError } from '../lib/http.js';
import { sendSms } from '../lib/notify.js';
import * as v from '../lib/validate.js';
import { thankYouSms } from '../services/messages.js';

const router = Router();
router.use(requireAuth('hospital', 'admin'));

const createSchema = z.object({
  bloodGroup: v.bloodGroup,
  unitsNeeded: z.coerce.number().int().min(1).max(20),
  urgency: v.urgency,
  note: z.string().trim().max(280).optional().or(z.literal('')),
});

const COUNTS = `
  count(a.id)::int AS alerted,
  count(a.id) FILTER (WHERE a.status = 'accepted')::int AS accepted,
  count(a.id) FILTER (WHERE a.status = 'donated')::int AS donated,
  count(a.id) FILTER (WHERE a.status = 'declined')::int AS declined`;

async function ownedRequest(c, req, id, lock = false) {
  const {
    rows: [r],
  } = await c.query(`SELECT * FROM blood_requests WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!r || (req.user.role !== 'admin' && r.hospital_id !== req.user.id)) throw new HttpError(404, 'Request not found');
  return r;
}

router.post('/', async (req, res) => {
  if (req.user.role !== 'hospital') throw new HttpError(403, 'Only hospitals can raise requests');
  const d = createSchema.parse(req.body);
  const {
    rows: [h],
  } = await query('SELECT verified FROM hospitals WHERE user_id = $1', [req.user.id]);
  if (!h?.verified) throw new HttpError(403, 'Your hospital is awaiting verification by an administrator');
  const ttl = config.matching.requestTtlHours[d.urgency];
  const {
    rows: [r],
  } = await query(
    `INSERT INTO blood_requests (hospital_id, blood_group, units_needed, urgency, note, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + make_interval(hours => $6::int)) RETURNING *`,
    [req.user.id, d.bloodGroup, d.unitsNeeded, d.urgency, d.note || null, ttl],
  );
  await publishEvent('request.created', { requestId: r.id });
  res.status(201).json(r);
});

router.get('/', async (req, res) => {
  const scope = req.user.role === 'admin' ? 'TRUE' : 'r.hospital_id = $1';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  const { rows } = await query(
    `SELECT r.*, ${COUNTS}
     FROM blood_requests r LEFT JOIN alerts a ON a.request_id = r.id
     WHERE ${scope}
     GROUP BY r.id
     ORDER BY (r.status = 'open') DESC, r.created_at DESC
     LIMIT 100`,
    params,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const id = v.id.parse(req.params.id);
  const r = await ownedRequest({ query }, req, id);
  const [{ rows: [counts] }, { rows: alerts }] = await Promise.all([
    query(`SELECT ${COUNTS} FROM alerts a WHERE a.request_id = $1`, [id]),
    query(
      `SELECT a.id, a.status, a.round, a.distance_km, a.eta_minutes, a.sent_at, a.responded_at,
              u.name, d.blood_group,
              CASE WHEN a.status IN ('accepted','donated','no_show') THEN u.phone END AS phone
       FROM alerts a JOIN users u ON u.id = a.donor_id JOIN donors d ON d.user_id = a.donor_id
       WHERE a.request_id = $1
       ORDER BY CASE a.status WHEN 'accepted' THEN 0 WHEN 'donated' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END, a.distance_km`,
      [id],
    ),
  ]);
  res.json({ ...r, ...counts, alerts, radiiKm: config.matching.radiiKm });
});

router.post('/:id/cancel', async (req, res) => {
  const id = v.id.parse(req.params.id);
  const r = await tx(async (c) => {
    const row = await ownedRequest(c, req, id, true);
    if (row.status !== 'open') throw new HttpError(409, 'Only open requests can be cancelled');
    const { rows: [u] } = await c.query(`UPDATE blood_requests SET status = 'cancelled', closed_at = now() WHERE id = $1 RETURNING *`, [id]);
    return u;
  });
  await publishEvent('request.cancelled', { requestId: id });
  res.json(r);
});

async function closeAlert(req, nextStatus) {
  const id = v.id.parse(req.params.id);
  const alertId = v.id.parse(req.params.alertId);
  return tx(async (c) => {
    const r = await ownedRequest(c, req, id, true);
    if (r.status !== 'open' && !(r.status === 'fulfilled' && nextStatus === 'donated')) {
      throw new HttpError(409, 'This request is closed');
    }
    const {
      rows: [a],
    } = await c.query(
      `UPDATE alerts SET status = $3 WHERE id = $1 AND request_id = $2 AND status = 'accepted' RETURNING donor_id`,
      [alertId, id, nextStatus],
    );
    if (!a) throw new HttpError(409, 'Only donors who accepted can be marked');
    let donor = null;
    let fulfilled = false;
    if (nextStatus === 'donated') {
      const { rows: [d] } = await c.query(
        `UPDATE donors SET last_donation_date = current_date, total_donations = total_donations + 1
         WHERE user_id = $1 RETURNING sex, (SELECT name FROM users WHERE id = $1) AS name, (SELECT phone FROM users WHERE id = $1) AS phone`,
        [a.donor_id],
      );
      donor = d;
      const { rows: [{ donated }] } = await c.query(
        `SELECT count(*)::int AS donated FROM alerts WHERE request_id = $1 AND status = 'donated'`,
        [id],
      );
      if (donated >= r.units_needed && r.status === 'open') {
        await c.query(`UPDATE blood_requests SET status = 'fulfilled', closed_at = now() WHERE id = $1`, [id]);
        fulfilled = true;
      }
    }
    return { id, donor, fulfilled };
  });
}

router.post('/:id/alerts/:alertId/donated', async (req, res) => {
  const { id, donor, fulfilled } = await closeAlert(req, 'donated');
  const next = addDays(todayYmd(), config.matching.cooldownDays[donor.sex]);
  await sendSms(donor.phone, thankYouSms(donor.name, next));
  if (fulfilled) await publishEvent('request.fulfilled', { requestId: id });
  res.json({ ok: true, fulfilled });
});

router.post('/:id/alerts/:alertId/no-show', async (req, res) => {
  await closeAlert(req, 'no_show');
  res.json({ ok: true });
});

export default router;
