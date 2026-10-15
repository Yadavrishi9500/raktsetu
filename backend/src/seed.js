/**
 * Demo data: one admin, one verified hospital, ~80 donors scattered around central Delhi.
 * Idempotent (ON CONFLICT DO NOTHING). Set SEED_MY_PHONE (+91...) and SEED_MY_GROUP to put
 * yourself in the donor pool so your phone receives alerts during a live demo.
 */
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, tx } from './db.js';
import { logger } from './logger.js';
import { runMigrations } from './migrate.js';

const CENTER = { lat: 28.6139, lng: 77.209 };
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Rohan', 'Arjun', 'Vihaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kavya', 'Meera', 'Riya', 'Priya', 'Neha', 'Rahul', 'Siddharth', 'Tanvi', 'Farhan', 'Zoya', 'Harpreet', 'Gurleen'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Khan', 'Iyer', 'Nair', 'Reddy', 'Mehta', 'Joshi', 'Kapoor', 'Malhotra', 'Bansal', 'Chopra', 'Das', 'Mishra'];
// Approximate ABO/Rh distribution in India
const GROUP_WEIGHTS = [['B+', 32], ['O+', 29], ['A+', 21], ['AB+', 8], ['B-', 3], ['O-', 3], ['A-', 2.5], ['AB-', 1.5]];

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickGroup(r) {
  let x = r() * 100;
  for (const [g, w] of GROUP_WEIGHTS) if ((x -= w) <= 0) return g;
  return 'O+';
}

function pointNear(r, maxKm) {
  const dist = Math.sqrt(r()) * maxKm;
  const angle = r() * 2 * Math.PI;
  return {
    lat: CENTER.lat + (dist / 110.574) * Math.cos(angle),
    lng: CENTER.lng + (dist / (111.32 * Math.cos((CENTER.lat * Math.PI) / 180))) * Math.sin(angle),
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export async function seed() {
  if (!config.adminPassword) throw new Error('ADMIN_PASSWORD must be set to seed in production');
  const r = rng(42);
  const donorHash = await bcrypt.hash('donor12345', 10);
  const hospitalHash = await bcrypt.hash('hospital12345', 10);
  const adminHash = await bcrypt.hash(config.adminPassword, 10);

  await tx(async (c) => {
    await c.query(
      `INSERT INTO users (role, email, password_hash, name, phone) VALUES ('admin',$1,$2,'RaktSetu Admin','+919000000001')
       ON CONFLICT (email) DO NOTHING`,
      [config.adminEmail, adminHash],
    );
    const h = await c.query(
      `INSERT INTO users (role, email, password_hash, name, phone)
       VALUES ('hospital','bloodbank@citycare.demo',$1,'Dr. Neha Kapoor','+919000000002')
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [hospitalHash],
    );
    if (h.rows[0]) {
      await c.query(
        `INSERT INTO hospitals (user_id, hospital_name, address, city, lat, lng, license_no, verified, verified_at)
         VALUES ($1,'City Care Hospital','14 Barakhamba Road, Connaught Place','New Delhi',$2,$3,'DL-BB-2291',true,now())`,
        [h.rows[0].id, CENTER.lat + 0.004, CENTER.lng + 0.012],
      );
    }

    const donors = [];
    for (let i = 1; i <= 80; i++) {
      const sex = r() < 0.62 ? 'male' : 'female';
      const p = pointNear(r, i <= 30 ? 6 : 40);
      const roll = r();
      donors.push({
        email: `donor${String(i).padStart(2, '0')}@demo.raktsetu.local`,
        name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
        phone: `+9198${String(10000000 + i).padStart(8, '0')}`,
        group: pickGroup(r), sex,
        dob: daysAgo(365 * (19 + Math.floor(r() * 40)) + Math.floor(r() * 300)),
        last: roll < 0.15 ? daysAgo(20 + Math.floor(r() * 50)) : roll < 0.5 ? daysAgo(130 + Math.floor(r() * 400)) : null,
        available: r() > 0.1, ...p,
      });
    }
    if (process.env.SEED_MY_PHONE) {
      donors.push({
        email: 'me@demo.raktsetu.local', name: process.env.SEED_MY_NAME || 'Demo Donor', phone: process.env.SEED_MY_PHONE,
        group: process.env.SEED_MY_GROUP || 'O-', sex: 'male', dob: daysAgo(365 * 22), last: null, available: true,
        lat: CENTER.lat + 0.01, lng: CENTER.lng + 0.01,
      });
    }
    for (const d of donors) {
      const u = await c.query(
        `INSERT INTO users (role, email, password_hash, name, phone) VALUES ('donor',$1,$2,$3,$4)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [d.email, donorHash, d.name, d.phone],
      );
      if (!u.rows[0]) continue;
      await c.query(
        `INSERT INTO donors (user_id, blood_group, sex, date_of_birth, lat, lng, city, last_donation_date, available, email_alerts, total_donations)
         VALUES ($1,$2,$3,$4,$5,$6,'New Delhi',$7,$8,false,$9)`,
        [u.rows[0].id, d.group, d.sex, d.dob, d.lat, d.lng, d.last, d.available, d.last ? 1 + Math.floor(r() * 6) : 0],
      );
    }
  });
  logger.info('demo data seeded');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(seed)
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'seed failed');
      process.exit(1);
    });
}
