import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  const {
    rows: [s],
  } = await query(`SELECT
      (SELECT count(*) FROM donors)::int AS donors,
      (SELECT count(DISTINCT lower(city)) FROM donors)::int AS cities,
      (SELECT count(*) FROM blood_requests WHERE status = 'fulfilled')::int AS fulfilled,
      (SELECT count(*) FROM alerts WHERE status = 'donated')::int AS units_donated`);
  res.set('Cache-Control', 'public, max-age=60');
  res.json(s);
});

export default router;
