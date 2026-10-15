import { config } from '../config.js';
import { query } from '../db.js';
import { eligibility } from '../lib/blood.js';

export async function loadProfile(user) {
  if (user.role === 'donor') {
    const {
      rows: [d],
    } = await query('SELECT * FROM donors WHERE user_id = $1', [user.id]);
    return d ? donorView(d) : null;
  }
  if (user.role === 'hospital') {
    const {
      rows: [h],
    } = await query('SELECT * FROM hospitals WHERE user_id = $1', [user.id]);
    return h
      ? {
          hospitalName: h.hospital_name, address: h.address, city: h.city, lat: h.lat, lng: h.lng,
          licenseNo: h.license_no, verified: h.verified, verifiedAt: h.verified_at,
        }
      : null;
  }
  return null;
}

export function donorView(d) {
  const e = eligibility(
    { sex: d.sex, dateOfBirth: d.date_of_birth, lastDonationDate: d.last_donation_date },
    config.matching.cooldownDays,
  );
  return {
    bloodGroup: d.blood_group, sex: d.sex, dateOfBirth: d.date_of_birth, lat: d.lat, lng: d.lng,
    city: d.city, pincode: d.pincode, available: d.available, lastDonationDate: d.last_donation_date,
    totalDonations: d.total_donations, emailAlerts: d.email_alerts,
    emailStatus: !d.email_alerts ? 'off' : d.email_subscription_arn?.startsWith('arn:') || d.email_subscription_arn === 'log-mode' ? 'on' : 'pending',
    eligible: e.eligible, eligibilityReason: e.reason, nextEligibleDate: e.nextDate,
  };
}
