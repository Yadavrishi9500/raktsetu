import { query, tx } from '../db.js';
import { HttpError } from '../lib/http.js';
import { sendSms } from '../lib/notify.js';
import { acceptedSms, standDownSms } from './messages.js';

const CLOSED_MESSAGES = {
  fulfilled: 'This request already has enough donors. Thank you for responding.',
  cancelled: 'The hospital cancelled this request. Thank you for responding.',
  expired: 'This request has expired. Thank you for responding.',
};

/** Donor accepts or declines an alert. Request row is locked so the unit count cannot be oversubscribed. */
export async function respondToAlert(alertId, response, etaMinutes = null) {
  const result = await tx(async (c) => {
    const {
      rows: [a],
    } = await c.query(
      `SELECT a.id, a.status, a.request_id, a.donor_id, r.status AS request_status, r.units_needed,
              r.blood_group, h.hospital_name, h.lat, h.lng, u.name AS donor_name, u.phone AS donor_phone
       FROM alerts a
       JOIN blood_requests r ON r.id = a.request_id
       JOIN hospitals h ON h.user_id = r.hospital_id
       JOIN users u ON u.id = a.donor_id
       WHERE a.id = $1
       FOR UPDATE OF a, r`,
      [alertId],
    );
    if (!a) throw new HttpError(404, 'This link is not valid');
    if (a.request_status !== 'open') throw new HttpError(409, CLOSED_MESSAGES[a.request_status]);
    if (a.status === 'donated' || a.status === 'no_show') throw new HttpError(409, 'This response is already closed');

    if (response === 'accept') {
      if (a.status === 'accepted') return { alert: a, status: 'accepted', changed: false };
      const {
        rows: [{ committed }],
      } = await c.query(
        `SELECT count(*)::int AS committed FROM alerts WHERE request_id = $1 AND status IN ('accepted','donated')`,
        [a.request_id],
      );
      if (committed >= a.units_needed) {
        throw new HttpError(409, 'Enough donors are already on the way. Thank you, we will reach out next time.');
      }
      const {
        rows: [busy],
      } = await c.query(
        `SELECT 1 FROM alerts x JOIN blood_requests br ON br.id = x.request_id
         WHERE x.donor_id = $1 AND x.status = 'accepted' AND br.status = 'open' AND x.id <> $2 LIMIT 1`,
        [a.donor_id, a.id],
      );
      if (busy) throw new HttpError(409, 'You have already accepted another open request. Complete that one first.');
      await c.query(`UPDATE alerts SET status = 'accepted', eta_minutes = $2, responded_at = now() WHERE id = $1`, [
        a.id,
        etaMinutes,
      ]);
      return { alert: a, status: 'accepted', changed: true };
    }

    if (a.status === 'declined') return { alert: a, status: 'declined', changed: false };
    await c.query(`UPDATE alerts SET status = 'declined', eta_minutes = NULL, responded_at = now() WHERE id = $1`, [a.id]);
    return { alert: a, status: 'declined', changed: true };
  });

  if (result.changed && result.status === 'accepted') {
    await sendSms(result.alert.donor_phone, acceptedSms(result.alert));
  }
  return { status: result.status, changed: result.changed };
}

/** Tell donors who accepted (but have not donated) that they can stand down. */
export async function standDownDonors(requestId, reason) {
  const { rows } = await query(
    `SELECT u.phone, r.blood_group, h.hospital_name
     FROM alerts a
     JOIN users u ON u.id = a.donor_id
     JOIN blood_requests r ON r.id = a.request_id
     JOIN hospitals h ON h.user_id = r.hospital_id
     WHERE a.request_id = $1 AND a.status = 'accepted'`,
    [requestId],
  );
  await Promise.allSettled(rows.map((r) => sendSms(r.phone, standDownSms(r, reason))));
  return rows.length;
}
