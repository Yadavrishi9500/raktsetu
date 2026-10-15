CREATE TYPE user_role AS ENUM ('donor', 'hospital', 'admin');

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  role          user_role   NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  phone         TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE donors (
  user_id                BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blood_group            TEXT NOT NULL CHECK (blood_group IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')),
  sex                    TEXT NOT NULL CHECK (sex IN ('male','female')),
  date_of_birth          DATE NOT NULL,
  lat                    DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                    DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  city                   TEXT NOT NULL,
  pincode                TEXT,
  available              BOOLEAN NOT NULL DEFAULT true,
  last_donation_date     DATE,
  total_donations        INT NOT NULL DEFAULT 0,
  email_alerts           BOOLEAN NOT NULL DEFAULT true,
  email_subscription_arn TEXT
);
CREATE INDEX donors_match_idx ON donors (blood_group, available, lat, lng);

CREATE TABLE hospitals (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hospital_name TEXT NOT NULL,
  address       TEXT NOT NULL,
  city          TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  license_no    TEXT NOT NULL,
  verified      BOOLEAN NOT NULL DEFAULT false,
  verified_at   TIMESTAMPTZ
);

CREATE TABLE blood_requests (
  id             BIGSERIAL PRIMARY KEY,
  hospital_id    BIGINT NOT NULL REFERENCES hospitals(user_id) ON DELETE CASCADE,
  blood_group    TEXT NOT NULL CHECK (blood_group IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')),
  units_needed   INT  NOT NULL CHECK (units_needed BETWEEN 1 AND 20),
  urgency        TEXT NOT NULL CHECK (urgency IN ('critical','urgent','scheduled')),
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','cancelled','expired')),
  round          INT  NOT NULL DEFAULT 0,
  radius_km      NUMERIC(6,1) NOT NULL DEFAULT 0,
  last_round_at  TIMESTAMPTZ,
  admin_notified BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ
);
CREATE INDEX blood_requests_open_idx ON blood_requests (status, last_round_at);
CREATE INDEX blood_requests_hospital_idx ON blood_requests (hospital_id, created_at DESC);

CREATE TABLE alerts (
  id           BIGSERIAL PRIMARY KEY,
  request_id   BIGINT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_id     BIGINT NOT NULL REFERENCES donors(user_id) ON DELETE CASCADE,
  token_hash   TEXT   NOT NULL UNIQUE,
  round        INT    NOT NULL,
  distance_km  NUMERIC(6,2) NOT NULL,
  status       TEXT   NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','donated','no_show')),
  eta_minutes  INT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (request_id, donor_id)
);
CREATE INDEX alerts_donor_idx ON alerts (donor_id, status);

CREATE TABLE notification_log (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT NOT NULL CHECK (channel IN ('sms','email','admin','event')),
  recipient   TEXT NOT NULL,
  subject     TEXT,
  body        TEXT NOT NULL,
  mode        TEXT NOT NULL,
  provider_id TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_log_created_idx ON notification_log (created_at DESC);
