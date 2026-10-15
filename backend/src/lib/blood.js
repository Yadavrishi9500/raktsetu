// Red-cell compatibility: recipient group -> donor groups that can give to it.
export const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

const COMPATIBLE_DONORS = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

export function compatibleDonorGroups(recipient) {
  const groups = COMPATIBLE_DONORS[recipient];
  if (!groups) throw new Error(`Unknown blood group: ${recipient}`);
  return [...groups];
}

export function canDonate(donorGroup, recipientGroup) {
  return compatibleDonorGroups(recipientGroup).includes(donorGroup);
}

const toUtc = (ymd) => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d) => d.toISOString().slice(0, 10);
export const todayYmd = (now = new Date()) => toYmd(now);

export function addDays(ymd, days) {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

export function addYears(ymd, years) {
  const [y, m, d] = ymd.split('-').map(Number);
  const out = new Date(Date.UTC(y + years, m - 1, d));
  if (out.getUTCMonth() !== m - 1) out.setUTCDate(0); // 29 Feb -> 28 Feb
  return toYmd(out);
}

export function ageOn(dobYmd, refYmd = todayYmd()) {
  const dob = toUtc(dobYmd);
  const ref = toUtc(refYmd);
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Returns the first date the donor may give whole blood again, or null if they never have. */
export function nextEligibleDate(sex, lastDonationYmd, cooldownDays) {
  if (!lastDonationYmd) return null;
  return addDays(lastDonationYmd, cooldownDays[sex]);
}

export function eligibility({ sex, dateOfBirth, lastDonationDate }, cooldownDays, refYmd = todayYmd()) {
  const age = ageOn(dateOfBirth, refYmd);
  if (age < 18) return { eligible: false, reason: 'under_18', nextDate: addYears(dateOfBirth, 18) };
  if (age > 65) return { eligible: false, reason: 'over_65', nextDate: null };
  const next = nextEligibleDate(sex, lastDonationDate, cooldownDays);
  if (next && next > refYmd) return { eligible: false, reason: 'cooldown', nextDate: next };
  return { eligible: true, reason: null, nextDate: null };
}
