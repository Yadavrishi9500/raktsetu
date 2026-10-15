import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError } from '../lib/http.js';
import { hashToken } from '../lib/tokens.js';
import { respondToAlert } from '../services/responses.js';

// Public, token-authenticated endpoints behind the SMS link. GET never changes state, so SMS
// link-preview bots that prefetch URLs cannot accept on a donor's behalf.
const router = Router();
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

async function findAlert(token) {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) throw new HttpError(404, 'This link is not valid');
  const {
    rows: [a],
  } = await query(
    `SELECT a.id, a.status, a.distance_km, a.eta_minutes, a.sent_at,
            r.blood_group, r.units_needed, r.urgency, r.note, r.status AS request_status, r.created_at,
            h.hospital_name, h.address, h.city, h.lat, h.lng, u.name AS donor_name,
            (SELECT count(*) FROM alerts x WHERE x.request_id = r.id AND x.status IN ('accepted','donated'))::int AS committed
     FROM alerts a
     JOIN blood_requests r ON r.id = a.request_id
     JOIN hospitals h ON h.user_id = r.hospital_id
     JOIN users u ON u.id = a.donor_id
     WHERE a.token_hash = $1`,
    [hashToken(parsed.data)],
  );
  if (!a) throw new HttpError(404, 'This link is not valid');
  return a;
}

const view = (a) => ({
  status: a.status, distanceKm: a.distance_km, etaMinutes: a.eta_minutes, sentAt: a.sent_at,
  donorFirstName: a.donor_name.split(' ')[0],
  request: {
    bloodGroup: a.blood_group, unitsNeeded: a.units_needed, urgency: a.urgency, note: a.note,
    status: a.request_status, committed: a.committed, createdAt: a.created_at,
  },
  hospital: { name: a.hospital_name, address: a.address, city: a.city, lat: a.lat, lng: a.lng },
});

router.get('/:token', async (req, res) => {
  res.json(view(await findAlert(req.params.token)));
});

router.post('/:token/respond', async (req, res) => {
  const a = await findAlert(req.params.token);
  const { response, etaMinutes } = z
    .object({ response: z.enum(['accept', 'decline']), etaMinutes: z.coerce.number().int().min(5).max(240).optional() })
    .parse(req.body);
  await respondToAlert(a.id, response, etaMinutes ?? null);
  res.json(view(await findAlert(req.params.token)));
});

export default router;
