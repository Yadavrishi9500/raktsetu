import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { signToken, requireAuth } from '../lib/auth.js';
import { ageOn, todayYmd } from '../lib/blood.js';
import { HttpError } from '../lib/http.js';
import { notifyAdmin, subscribeDonorEmail } from '../lib/notify.js';
import * as v from '../lib/validate.js';
import { logger } from '../logger.js';
import { loadProfile } from '../services/profiles.js';

const router = Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const base = { name: v.name, email: v.email, password: v.password, phone: v.phone };

const donorSchema = z
  .object({
    ...base,
    bloodGroup: v.bloodGroup,
    sex: z.enum(['male', 'female']),
    dateOfBirth: v.ymd,
    lat: v.lat,
    lng: v.lng,
    city: z.string().trim().min(2).max(80),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Use a 6-digit PIN code').optional().or(z.literal('')),
    lastDonationDate: v.ymd.optional().or(z.literal('')),
    emailAlerts: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    const age = ageOn(d.dateOfBirth);
    if (age < 18 || age > 65) ctx.addIssue({ path: ['dateOfBirth'], code: 'custom', message: 'Donors must be 18 to 65 years old' });
    if (d.lastDonationDate && d.lastDonationDate > todayYmd())
      ctx.addIssue({ path: ['lastDonationDate'], code: 'custom', message: 'This date is in the future' });
  });

const hospitalSchema = z.object({
  ...base,
  hospitalName: z.string().trim().min(3).max(160),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  lat: v.lat,
  lng: v.lng,
  licenseNo: z.string().trim().min(3).max(60),
});

async function emailTaken(email) {
  const { rowCount } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (rowCount) throw new HttpError(409, 'An account with this email already exists', { email: ['Already registered'] });
}

const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone });

router.post('/register/donor', async (req, res) => {
  const d = donorSchema.parse(req.body);
  await emailTaken(d.email);
  const hash = await bcrypt.hash(d.password, 10);
  const user = await tx(async (c) => {
    const {
      rows: [u],
    } = await c.query(
      `INSERT INTO users (role, email, password_hash, name, phone) VALUES ('donor',$1,$2,$3,$4) RETURNING *`,
      [d.email, hash, d.name, d.phone],
    );
    await c.query(
      `INSERT INTO donors (user_id, blood_group, sex, date_of_birth, lat, lng, city, pincode, last_donation_date, email_alerts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [u.id, d.bloodGroup, d.sex, d.dateOfBirth, d.lat, d.lng, d.city, d.pincode || null, d.lastDonationDate || null, d.emailAlerts],
    );
    return u;
  });
  if (d.emailAlerts) {
    try {
      const arn = await subscribeDonorEmail(user.id, user.email);
      if (arn) await query('UPDATE donors SET email_subscription_arn = $2 WHERE user_id = $1', [user.id, arn]);
    } catch (err) {
      logger.warn({ err }, 'email subscription failed; donor still receives SMS');
    }
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/register/hospital', async (req, res) => {
  const d = hospitalSchema.parse(req.body);
  await emailTaken(d.email);
  const hash = await bcrypt.hash(d.password, 10);
  const user = await tx(async (c) => {
    const {
      rows: [u],
    } = await c.query(
      `INSERT INTO users (role, email, password_hash, name, phone) VALUES ('hospital',$1,$2,$3,$4) RETURNING *`,
      [d.email, hash, d.name, d.phone],
    );
    await c.query(
      `INSERT INTO hospitals (user_id, hospital_name, address, city, lat, lng, license_no) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [u.id, d.hospitalName, d.address, d.city, d.lat, d.lng, d.licenseNo],
    );
    return u;
  });
  await notifyAdmin(
    `New hospital awaiting verification: ${d.hospitalName}`,
    `${d.hospitalName} (${d.city}) registered with licence ${d.licenseNo}. Contact: ${d.name}, ${d.phone}, ${d.email}. Verify it in the RaktSetu admin panel.`,
  );
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = z.object({ email: v.email, password: z.string().min(1).max(72) }).parse(req.body);
  const {
    rows: [user],
  } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth(), async (req, res) => {
  const {
    rows: [user],
  } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!user) throw new HttpError(401, 'Your account no longer exists');
  res.json({ user: publicUser(user), profile: await loadProfile(user) });
});

export default router;
