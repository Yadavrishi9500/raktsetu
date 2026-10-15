import { PublishCommand, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns';
import { config } from '../config.js';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { sns } from './aws.js';

// SNS Subject: ASCII, single line, < 100 chars.
const safeSubject = (s) => s.replace(/[^\x20-\x7E]/g, '').slice(0, 99);

async function record({ channel, recipient, subject = null, body, providerId = null, error = null }) {
  try {
    await query(
      `INSERT INTO notification_log (channel, recipient, subject, body, mode, provider_id, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [channel, recipient, subject, body, config.notifyMode, providerId, error],
    );
  } catch (err) {
    logger.warn({ err }, 'failed to write notification log');
  }
}

async function deliver(channel, recipient, subject, body, send) {
  if (!sns) {
    logger.info({ channel, recipient, subject, body }, 'notification (log mode)');
    await record({ channel, recipient, subject, body });
    return { ok: true };
  }
  try {
    const out = await send();
    await record({ channel, recipient, subject, body, providerId: out.MessageId });
    return { ok: true, id: out.MessageId };
  } catch (err) {
    logger.error({ err, channel, recipient }, 'notification failed');
    await record({ channel, recipient, subject, body, error: err.message });
    return { ok: false, error: err.message };
  }
}

export function sendSms(phone, body) {
  return deliver('sms', phone, null, body, () => {
    const attrs = { 'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' } };
    if (config.sms.senderId) attrs['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: config.sms.senderId };
    if (config.sms.dltEntityId) attrs['AWS.MM.SMS.EntityId'] = { DataType: 'String', StringValue: config.sms.dltEntityId };
    if (config.sms.dltTemplateId) attrs['AWS.MM.SMS.TemplateId'] = { DataType: 'String', StringValue: config.sms.dltTemplateId };
    return sns.send(new PublishCommand({ PhoneNumber: phone, Message: body, MessageAttributes: attrs }));
  });
}

/**
 * Targeted email through ONE shared SNS topic: every donor's email subscription carries a
 * filter policy {"donor_id": ["<id>"]}, so publishing with that attribute reaches only them.
 */
export function sendDonorEmail(donorId, subject, body) {
  if (sns && !config.topics.donorEmail) return Promise.resolve({ ok: false, error: 'no donor email topic' });
  return deliver('email', `donor:${donorId}`, safeSubject(subject), body, () =>
    sns.send(
      new PublishCommand({
        TopicArn: config.topics.donorEmail,
        Subject: safeSubject(subject),
        Message: body,
        MessageAttributes: { donor_id: { DataType: 'String', StringValue: String(donorId) } },
      }),
    ),
  );
}

export function notifyAdmin(subject, body) {
  if (sns && !config.topics.admin) return Promise.resolve({ ok: false, error: 'no admin topic' });
  return deliver('admin', 'admins', safeSubject(subject), body, () =>
    sns.send(new PublishCommand({ TopicArn: config.topics.admin, Subject: safeSubject(subject), Message: body })),
  );
}

export async function subscribeDonorEmail(donorId, emailAddress) {
  if (!sns) return 'log-mode';
  if (!config.topics.donorEmail) return null;
  const out = await sns.send(
    new SubscribeCommand({
      TopicArn: config.topics.donorEmail,
      Protocol: 'email',
      Endpoint: emailAddress,
      ReturnSubscriptionArn: true,
      Attributes: { FilterPolicy: JSON.stringify({ donor_id: [String(donorId)] }) },
    }),
  );
  return out.SubscriptionArn;
}

export async function unsubscribe(arn) {
  if (!sns || !arn?.startsWith('arn:')) return;
  try {
    await sns.send(new UnsubscribeCommand({ SubscriptionArn: arn }));
  } catch (err) {
    // Pending (unconfirmed) subscriptions cannot be removed; they expire on their own after 3 days.
    logger.warn({ err, arn }, 'unsubscribe failed');
  }
}
