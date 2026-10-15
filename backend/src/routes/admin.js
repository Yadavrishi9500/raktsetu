import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { sendSms } from '../lib/notify.js';
import * as v from '../lib/validate.js';

const router = Router();
router.use(requireAuth('admin'));

router.get('/hospitals', async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'verified', 'all']).default('pending') }).parse(req.query);
  const where = { pending: 'NOT h.verified', verified: 'h.verified', all: 'TRUE' }[status];
  const { rows } = await query(
    `SELECT h.*, u.name AS contact_name, u.email, u.phone, u.created_at
     FROM hospitals h JOIN users u ON u.id = h.user_id
     WHERE ${where} ORDER BY u.created_at DESC LIMIT 200`,
  );
  res.json(rows);
});

router.post('/hospitals/:id/verify', async (req, res) => {
  const id = v.id.parse(req.params.id);
  const {
    rows: [h],
  } = await query(
    `UPDATE hospitals h SET verified = true, verified_at = now() FROM users u
     WHERE h.user_id = $1 AND u.id = h.user_id AND NOT h.verified
     RETURNING h.hospital_name, u.phone`,
    [id],
  );
  if (!h) throw new HttpError(404, 'Hospital not found or already verified');
  await sendSms(h.phone, `RaktSetu: ${h.hospital_name} is verified. You can now raise blood requests.`);
  res.json({ ok: true });
});

router.get('/stats', async (_req, res) => {
  const [groups, requests, response] = await Promise.all([
    query(`SELECT blood_group, count(*)::int AS donors, count(*) FILTER (WHERE available)::int AS available FROM donors GROUP BY 1 ORDER BY 1`),
    query(`SELECT
             count(*) FILTER (WHERE status = 'open')::int AS open,
             count(*) FILTER (WHERE status = 'fulfilled' AND closed_at > now() - interval '30 days')::int AS fulfilled_30d,
             count(*) FILTER (WHERE status = 'expired' AND closed_at > now() - interval '30 days')::int AS expired_30d,
             count(*)::int AS total
           FROM blood_requests`),
    query(`SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY mins)::numeric, 1)::float8 AS median_minutes_to_first_accept
           FROM (SELECT extract(epoch FROM min(a.responded_at) - r.created_at) / 60 AS mins
                 FROM blood_requests r JOIN alerts a ON a.request_id = r.id AND a.status IN ('accepted','donated')
                 GROUP BY r.id) t`),
  ]);
  res.json({ bloodGroups: groups.rows, requests: requests.rows[0], ...response.rows[0] });
});

router.get('/notifications', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
  const { rows } = await query(`SELECT * FROM notification_log ORDER BY id DESC LIMIT $1`, [limit]);
  res.json(rows);
});

export default router;
