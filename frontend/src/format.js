export const fmtGroup = (g) => g.replace('-', '\u2212');
export const URGENCY_LABEL = { critical: 'Critical', urgent: 'Urgent', scheduled: 'Scheduled' };
export const ALERT_LABEL = { sent: 'Alerted', accepted: 'Coming', declined: 'Declined', donated: 'Donated', no_show: 'Did not arrive' };
export const REQUEST_LABEL = { open: 'Open', fulfilled: 'Fulfilled', cancelled: 'Cancelled', expired: 'Expired' };

export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const fmtDate = (ymd) =>
  ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const mapsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
