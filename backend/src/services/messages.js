import { config } from '../config.js';

// SMS copy stays ASCII so a message fits in GSM-7 segments (160 chars) rather than UCS-2 (70).
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}.` : s);
const URGENCY_PREFIX = { critical: 'URGENT: ', urgent: 'Urgent: ', scheduled: '' };

export const alertLink = (token) => `${config.publicBaseUrl}/r/${token}`;
export const mapsLink = (lat, lng) => `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

export function alertSms(req, donor, token) {
  return `RaktSetu ${URGENCY_PREFIX[req.urgency]}${req.blood_group} blood needed at ${trunc(req.hospital_name, 28)}, ${donor.distance_km.toFixed(1)} km away. Can you donate? ${alertLink(token)}`;
}

export function alertEmail(req, donor, token) {
  return {
    subject: `${URGENCY_PREFIX[req.urgency]}${req.blood_group} blood needed at ${req.hospital_name}`,
    body: [
      `Hi ${donor.name.split(' ')[0]},`,
      '',
      `${req.hospital_name} needs ${req.units_needed} unit(s) of ${req.blood_group} blood and your blood group is a match.`,
      '',
      `Hospital: ${req.hospital_name}`,
      `Address: ${req.address}, ${req.h_city}`,
      `Distance from you: ${donor.distance_km.toFixed(1)} km`,
      req.note ? `Note from the hospital: ${req.note}` : null,
      '',
      `Tell the hospital whether you can come: ${alertLink(token)}`,
      '',
      'Thank you for being a donor.',
      'RaktSetu',
    ]
      .filter((l) => l !== null)
      .join('\n'),
  };
}

export function acceptedSms(a) {
  return `RaktSetu: Thank you ${a.donor_name.split(' ')[0]}! ${trunc(a.hospital_name, 30)} is expecting you. Directions: ${mapsLink(a.lat, a.lng)} Show this SMS at the blood bank.`;
}

export function standDownSms(r, reason) {
  const why = reason === 'fulfilled' ? 'has enough donors now' : 'was cancelled by the hospital';
  return `RaktSetu: The ${r.blood_group} request at ${trunc(r.hospital_name, 30)} ${why}. You do not need to go. Thank you for stepping up.`;
}

export function thankYouSms(name, nextDate) {
  return `RaktSetu: Thank you for donating today, ${name.split(' ')[0]}. You can donate again from ${nextDate}. You may have saved up to three lives.`;
}
