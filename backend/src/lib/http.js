import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Some fields need attention',
      fields: err.flatten().fieldErrors,
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, fields: err.fields });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'That record already exists' });
  }
  (req.log || logger).error({ err }, 'unhandled error');
  return res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
}
