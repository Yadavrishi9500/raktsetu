import { z } from 'zod';
import { BLOOD_GROUPS } from './blood.js';

export const id = z.coerce.number().int().positive();
export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters');
export const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, for example +919876543210');
export const name = z.string().trim().min(2, 'Enter a name').max(120);
export const lat = z.coerce.number().min(-90).max(90);
export const lng = z.coerce.number().min(-180).max(180);
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const bloodGroup = z.enum(BLOOD_GROUPS, { errorMap: () => ({ message: 'Choose a blood group' }) });
export const urgency = z.enum(['critical', 'urgent', 'scheduled']);
