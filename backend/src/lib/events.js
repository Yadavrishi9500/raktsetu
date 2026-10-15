import { PublishCommand } from '@aws-sdk/client-sns';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { sns } from './aws.js';

/**
 * Domain events. In AWS: published to the SNS events topic, which fans out to the worker's
 * SQS queue (raw delivery) and any other subscribers. Locally: POSTed straight to the worker.
 * Delivery is at-least-once, so every handler in the worker is idempotent.
 */
export async function publishEvent(type, payload) {
  const message = JSON.stringify({ type, payload, at: new Date().toISOString() });
  if (sns) {
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: config.topics.events,
          Message: message,
          MessageAttributes: { event_type: { DataType: 'String', StringValue: type } },
        }),
      );
    } catch (err) {
      // Not fatal: the escalation cron also picks up requests that never started a round.
      logger.error({ err, type }, 'failed to publish event');
    }
    return;
  }
  if (config.localWorkerUrl) {
    const headers = { 'content-type': 'application/json' };
    if (config.taskSecret) headers['x-task-secret'] = config.taskSecret;
    fetch(`${config.localWorkerUrl}/tasks/sns`, { method: 'POST', headers, body: message }).catch((err) =>
      logger.warn({ err: err.message, type }, 'local worker delivery failed; escalation cron will retry'),
    );
    return;
  }
  logger.warn({ type }, 'no event transport configured; event dropped');
}
