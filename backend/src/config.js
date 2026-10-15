const env = process.env;
const isProd = env.NODE_ENV === 'production';

function databaseUrl() {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  // Beanstalk-attached RDS exposes these.
  if (env.RDS_HOSTNAME) {
    const user = encodeURIComponent(env.RDS_USERNAME);
    const pass = encodeURIComponent(env.RDS_PASSWORD);
    return `postgres://${user}:${pass}@${env.RDS_HOSTNAME}:${env.RDS_PORT || 5432}/${env.RDS_DB_NAME}`;
  }
  return 'postgres://raktsetu:raktsetu@localhost:5432/raktsetu';
}

const jwtSecret = env.JWT_SECRET || (isProd ? '' : 'dev-only-insecure-secret-change-me');
if (!jwtSecret) throw new Error('JWT_SECRET must be set in production');
if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const notifyMode = env.NOTIFY_MODE || (isProd ? 'sns' : 'log');
if (!['sns', 'log'].includes(notifyMode)) throw new Error('NOTIFY_MODE must be "sns" or "log"');

const list = (v, fallback) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

export const config = {
  isProd,
  port: Number(env.PORT || 8080),
  logLevel: env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  trustProxy: Number(env.TRUST_PROXY ?? 1),
  corsOrigins: list(env.CORS_ORIGIN, []),

  databaseUrl: databaseUrl(),
  dbSsl: env.DB_SSL || 'off', // off | require | verify
  dbSslCa: env.DB_SSL_CA || '/app/certs/rds-global-bundle.pem',
  dbPoolMax: Number(env.DB_POOL_MAX || 10),

  jwtSecret,
  jwtTtl: env.JWT_TTL || '7d',

  publicBaseUrl: (env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),

  notifyMode,
  awsRegion: env.AWS_REGION || env.AWS_DEFAULT_REGION || 'ap-south-1',
  topics: {
    events: env.SNS_EVENTS_TOPIC_ARN || '',
    donorEmail: env.SNS_DONOR_EMAIL_TOPIC_ARN || '',
    admin: env.SNS_ADMIN_TOPIC_ARN || '',
  },
  sms: {
    senderId: env.SMS_SENDER_ID || '',
    // India DLT registration (required for production SMS to Indian numbers)
    dltEntityId: env.SMS_DLT_ENTITY_ID || '',
    dltTemplateId: env.SMS_DLT_TEMPLATE_ID || '',
  },

  // Local development: deliver events straight to the worker instead of SNS->SQS.
  localWorkerUrl: env.LOCAL_WORKER_URL || '',
  localCron: env.LOCAL_CRON === 'true',
  taskSecret: env.TASK_SECRET || '',

  seedDemo: env.SEED_DEMO === 'true',
  adminEmail: env.ADMIN_EMAIL || 'admin@raktsetu.local',
  adminPassword: env.ADMIN_PASSWORD || (isProd ? '' : 'admin12345'),

  matching: {
    radiiKm: list(env.MATCH_RADII_KM, ['5', '10', '25', '50']).map(Number),
    alertsPerUnit: Number(env.MATCH_ALERTS_PER_UNIT || 4),
    minPerRound: Number(env.MATCH_MIN_PER_ROUND || 8),
    maxPerRound: Number(env.MATCH_MAX_PER_ROUND || 25),
    escalateAfterMin: {
      critical: Number(env.ESCALATE_CRITICAL_MIN || 5),
      urgent: Number(env.ESCALATE_URGENT_MIN || 10),
      scheduled: Number(env.ESCALATE_SCHEDULED_MIN || 30),
    },
    requestTtlHours: { critical: 12, urgent: 24, scheduled: 72 },
    cooldownDays: {
      male: Number(env.COOLDOWN_MALE_DAYS || 90),
      female: Number(env.COOLDOWN_FEMALE_DAYS || 120),
    },
  },
};

if (notifyMode === 'sns' && !config.topics.events) {
  throw new Error('SNS_EVENTS_TOPIC_ARN is required when NOTIFY_MODE=sns');
}
