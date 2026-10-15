import { config } from '../config.js';
import { query, tx } from '../db.js';
import { compatibleDonorGroups } from '../lib/blood.js';
import { notifyAdmin, sendDonorEmail, sendSms } from '../lib/notify.js';
import { newAlertToken } from '../lib/tokens.js';
import { logger } from '../logger.js';
import { alertEmail, alertSms } from './messages.js';

// Eligible, available, compatible donors inside the radius who were not alerted for this request
// yet and are not already committed to another open request. Exact-group donors come first so
// universal O- stock is not burned on requests other donors could cover.
const MATCH_SQL = `
SELECT d.user_id, u.name, u.phone, d.blood_group, d.email_alerts, d.email_subscription_arn,
       round(dist.km::numeric, 2)::float8 AS distance_km
FROM donors d
JOIN users u ON u.id = d.user_id
CROSS JOIN LATERAL (
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(d.lat - $1) / 2), 2) +
    cos(radians($1)) * cos(radians(d.lat)) * power(sin(radians(d.lng - $2) / 2), 2)
  )) AS km
) dist
WHERE d.available
  AND d.blood_group = ANY($3::text[])
  AND d.lat BETWEEN $1 - $11 AND $1 + $11
  AND d.lng BETWEEN $2 - $12 AND $2 + $12
  AND dist.km <= $4
  AND d.date_of_birth <= current_date - interval '18 years'
  AND d.date_of_birth >  current_date - interval '66 years'
  AND (d.last_donation_date IS NULL OR
       d.last_donation_date <= current_date - (CASE WHEN d.sex = 'female' THEN $6::int ELSE $5::int END))
  AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.request_id = $7 AND a.donor_id = d.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM alerts a JOIN blood_requests br ON br.id = a.request_id
    WHERE a.donor_id = d.user_id AND a.status = 'accepted' AND br.status = 'open')
ORDER BY (d.blood_group = $8) DESC, dist.km ASC
LIMIT $9
OFFSET $10`;

const COMMITTED_SQL = `(SELECT count(*) FROM alerts a WHERE a.request_id = r.id AND a.status IN ('accepted','donated'))::int`;

/**
 * Runs one matching round for a request: picks the next radius, alerts a batch of donors,
 * advances the round counter. Safe to call concurrently and repeatedly (row lock + round checks).
 */
export async function runRound(requestId, { initial = false } = {}) {
  const plan = await tx(async (c) => {
    const {
      rows: [req],
    } = await c.query(
      `SELECT r.*, h.lat AS h_lat, h.lng AS h_lng, h.hospital_name, h.address, h.city AS h_city,
              hu.phone AS hospital_phone, ${COMMITTED_SQL} AS committed
       FROM blood_requests r
       JOIN hospitals h ON h.user_id = r.hospital_id
       JOIN users hu ON hu.id = h.user_id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [requestId],
    );
    if (!req) return { skipped: 'not-found' };
    if (req.status !== 'open') return { skipped: 'closed' };
    if (initial && req.round > 0) return { skipped: 'already-started' };
    if (new Date(req.expires_at) < new Date()) {
      await c.query(`UPDATE blood_requests SET status = 'expired', closed_at = now() WHERE id = $1`, [req.id]);
      return { skipped: 'expired' };
    }
    const short = req.units_needed - req.committed;
    if (short <= 0) return { skipped: 'enough-donors' };

    const radii = config.matching.radiiKm;
    if (req.round >= radii.length) return { skipped: 'exhausted', req };

    const radius = radii[req.round];
    const { alertsPerUnit, minPerRound, maxPerRound, cooldownDays } = config.matching;
    const limit = Math.min(maxPerRound, Math.max(short * alertsPerUnit, minPerRound));
    const latDelta = radius / 110.574;
    const lngDelta = radius / (111.32 * Math.max(Math.cos((req.h_lat * Math.PI) / 180), 0.01));

    const { rows: donors } = await c.query(MATCH_SQL, [
      req.h_lat, req.h_lng, compatibleDonorGroups(req.blood_group), radius,
      cooldownDays.male, cooldownDays.female, req.id, req.blood_group, limit, 0, latDelta, lngDelta,
    ]);

    const alerts = [];
    for (const d of donors) {
      const { token, hash } = newAlertToken();
      const { rowCount } = await c.query(
        `INSERT INTO alerts (request_id, donor_id, token_hash, round, distance_km)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (request_id, donor_id) DO NOTHING`,
        [req.id, d.user_id, hash, req.round + 1, d.distance_km],
      );
      if (rowCount) alerts.push({ ...d, token });
    }

    await c.query(`UPDATE blood_requests SET round = round + 1, radius_km = $2, last_round_at = now() WHERE id = $1`, [
      req.id,
      radius,
    ]);
    return { req, radius, alerts };
  });

  if (plan.skipped) {
    if (plan.skipped === 'exhausted') await flagExhausted(plan.req);
    logger.info({ requestId, skipped: plan.skipped }, 'matching round skipped');
    return { requestId, skipped: plan.skipped };
  }

  // Send outside the transaction so no DB lock is held during network calls. Small batches keep
  // us under the SNS SMS send-rate quota.
  for (let i = 0; i < plan.alerts.length; i += 10) {
    await Promise.allSettled(plan.alerts.slice(i, i + 10).map((a) => sendAlert(plan.req, a)));
  }
  const result = { requestId, round: plan.req.round + 1, radiusKm: plan.radius, alerted: plan.alerts.length };
  logger.info(result, 'matching round complete');
  return result;
}

async function sendAlert(req, donor) {
  await sendSms(donor.phone, alertSms(req, donor, donor.token));
  if (donor.email_alerts && donor.email_subscription_arn) {
    const { subject, body } = alertEmail(req, donor, donor.token);
    await sendDonorEmail(donor.user_id, subject, body);
  }
}

async function flagExhausted(req) {
  const { rowCount } = await query(
    `UPDATE blood_requests SET admin_notified = true WHERE id = $1 AND admin_notified = false`,
    [req.id],
  );
  if (!rowCount) return;
  const maxKm = config.matching.radiiKm.at(-1);
  await notifyAdmin(
    `Request ${req.id} still short: ${req.blood_group} at ${req.hospital_name}`,
    `Every eligible donor within ${maxKm} km has been alerted, but request #${req.id} (${req.units_needed} unit(s) of ${req.blood_group}, ${req.urgency}) at ${req.hospital_name}, ${req.h_city} has ${req.committed} committed donor(s). Consider contacting nearby blood banks directly.`,
  );
  await sendSms(
    req.hospital_phone,
    `RaktSetu: All eligible ${req.blood_group} donors within ${maxKm} km have been alerted for request #${req.id}. Responses so far: ${req.committed}/${req.units_needed}. Our team has been notified.`,
  );
}

/** Cron task: expire stale requests and run the next round wherever responses are short. */
export async function escalate() {
  const expired = await query(
    `UPDATE blood_requests SET status = 'expired', closed_at = now()
     WHERE status = 'open' AND expires_at < now() RETURNING id`,
  );
  const { critical, urgent, scheduled } = config.matching.escalateAfterMin;
  const { rows } = await query(
    `SELECT r.id FROM blood_requests r
     WHERE r.status = 'open' AND r.admin_notified = false
       AND (
         (r.round = 0 AND r.created_at < now() - interval '1 minute') OR
         (r.round > 0 AND r.last_round_at < now() - make_interval(mins => CASE r.urgency
             WHEN 'critical' THEN $1::int WHEN 'urgent' THEN $2::int ELSE $3::int END))
       )
       AND ${COMMITTED_SQL} < r.units_needed
     ORDER BY CASE r.urgency WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, r.created_at
     LIMIT 50`,
    [critical, urgent, scheduled],
  );
  const results = [];
  for (const { id } of rows) {
    try {
      results.push(await runRound(id));
    } catch (err) {
      logger.error({ err, requestId: id }, 'escalation round failed');
      results.push({ requestId: id, error: err.message });
    }
  }
  return { expired: expired.rowCount, rounds: results };
}
