import { SNSClient } from '@aws-sdk/client-sns';
import { config } from '../config.js';

export const sns = config.notifyMode === 'sns' ? new SNSClient({ region: config.awsRegion }) : null;
