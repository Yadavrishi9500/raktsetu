import crypto from 'node:crypto';

// The raw token only ever exists in the SMS/email link; the database stores its hash.
export function newAlertToken() {
  const token = crypto.randomBytes(18).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
