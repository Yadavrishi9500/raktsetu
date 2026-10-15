import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { todayYmd } from '../lib/blood.js';
import { HttpError } from '../lib/http.js';
import { subscribeDonorEmail, unsubscribe } from '../lib/notify.js';
import * as v from '../lib/validate.js';
import { donorView } from '../services/profiles.js';
import { respondToAlert } from '../services/responses.js';

const router = Router();
router.use(requireAuth('donor'));

const patchSchema = z
  .object({
    available: z.boolean(),
    lat: v.lat,
    lng: v.lng,
    city: z.string().trim().min(2).max(80),
    pincode: z.string().trim().regex(/^\d{6}$/).or(z.literal('')),
    emailAlerts: z.boolean(),
    lastDonationDate: v.ymd.refine((d) => d <= todayYmd(), 'This date is in the future').or(z.literal('')),
  })
  .partial()
  .strict();

const COLUMNS = { available: 'available', lat: 'lat', lng: 'lng', city: 'city', pincode: 'pincode', emailAlerts: 'email_alerts', lastDonationDate: 'last_donation_date' };

router.get('/me', async (req, res) => {
  const {
    rows: [d],
  } = await query('SELECT * FROM donors WHERE user_id = $1', [req.user.id]);
  if (!d) throw new HttpError(404, 'Donor profile not found');
  res.json(donorView(d));
});

router.patch('/me', async (req, res) => {
  const patch = patchSchema.parse(req.body);
  const keys = Object.keys(patch);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`);
  const values = keys.map((k) => (patch[k] === '' ? null : patch[k]));
  const {
    rows: [d],
  } = await query(`UPDATE donors SET ${sets.join(', ')} WHERE user_id = $1 RETURNING *`, [req.user.id, ...values]);

  if ('emailAlerts' in patch) {
    if (patch.emailAlerts && !d.email_subscription_arn) {
      const { rows: [u] } = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
      const arn = await subscribeDonorEmail(req.user.id, u.email);
      if (arn) d.email_subscription_arn = (await query('UPDATE donors SET email_subscription_arn = $2 WHERE user_id = $1 RETURNING email_subscription_arn', [req.user.id, arn])).rows[0].email_subscription_arn;
    } else if (!patch.emailAlerts && d.email_subscription_arn) {
      await unsubscribe(d.email_subscription_arn);
      await query('UPDATE donors SET email_subscription_arn = NULL WHERE user_id = $1', [req.user.id]);
      d.email_subscription_arn = null;
    }
  }
  res.json(donorView(d));
});

router.get('/me/alerts', async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.status, a.distance_km, a.eta_minutes, a.sent_at, a.responded_at,
            r.id AS request_id, r.blood_group, r.units_needed, r.urgency, r.status AS request_status, r.note,
            h.hospital_name, h.address, h.city, h.lat, h.lng
     FROM alerts a
     JOIN blood_requests r ON r.id = a.request_id
     JOIN hospitals h ON h.user_id = r.hospital_id
     WHERE a.donor_id = $1
     ORDER BY (r.status = 'open' AND a.status IN ('sent','accepted')) DESC, a.sent_at DESC
     LIMIT 50`,
    [req.user.id],
  );
  res.json(rows);
});

const respondSchema = z.object({
  response: z.enum(['accept', 'decline']),
  etaMinutes: z.coerce.number().int().min(5).max(240).optional(),
});

router.post('/me/alerts/:alertId/respond', async (req, res) => {
  const alertId = v.id.parse(req.params.alertId);
  const { response, etaMinutes } = respondSchema.parse(req.body);
  const { rowCount } = await query('SELECT 1 FROM alerts WHERE id = $1 AND donor_id = $2', [alertId, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Alert not found');
  res.json(await respondToAlert(alertId, response, etaMinutes ?? null));
});

export default router;
