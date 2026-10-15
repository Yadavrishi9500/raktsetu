# RaktSetu: emergency blood donor alert network

A hospital raises a blood request. RaktSetu finds compatible, eligible donors nearby and texts them a link.
Donors tap "I'm coming", and the hospital's dashboard updates live. If too few say yes, the search radius widens
automatically (5 → 10 → 25 → 50 km) until the request is covered.

```
 Hospitals + donors
        │  HTTPS
        ▼
 ┌────────────── AWS CloudFront ──────────────┐
 │  /*      → S3 (React build, private, OAC)  │
 │  /api/*  → Beanstalk web env               │
 └────────────────────────────────────────────┘
                     │
        Beanstalk WEB env (Docker: node src/server.js) ──── RDS PostgreSQL
                     │ publish request.created / cancelled / fulfilled
                     ▼
              SNS events topic ──► SQS queue (+DLQ) ──► Beanstalk WORKER env (Docker: node src/worker.js)
                                                         │  matching rounds, cron.yaml escalation
                                                         ▼
                                       SNS SMS to phones + SNS email (filter policy per donor)

 Chef-managed CI node (EC2): git poll → docker build → push ECR → deploy both Beanstalk envs
```

## Where each technology is used

| Tech | Role in RaktSetu | Files |
|---|---|---|
| **HTTP requests** | REST API for every action; the SMS link is a GET (read-only, safe from link-preview bots) followed by a POST to accept | `backend/src/routes/` |
| **AWS CloudFront** | Single HTTPS domain, edge-cached SPA, `/api/*` proxied to Beanstalk, SPA routing via a CloudFront Function, security headers | `infra/aws/cdn.yaml` |
| **SNS** | 1) event fan-out (topic → SQS) 2) direct SMS to donor phones 3) targeted email via one topic + per-donor filter policies 4) admin alerts | `backend/src/lib/notify.js`, `events.js` |
| **Elastic Beanstalk** | Web environment (API) + Worker environment (SQS consumer via sqsd, `cron.yaml` escalation every 2 min) | `deploy/` |
| **Docker** | One multi-stage image, two roles; non-root, tini, healthcheck, RDS CA bundle baked in | `backend/Dockerfile`, `docker-compose.yml` |
| **Chef** | Converges an EC2 build node: Docker, deploy user, SSH hardening, security auto-updates, log rotation, systemd auto-deploy timer | `infra/chef/` |

## Run it locally (5 minutes)

**With Docker:**

```bash
docker compose up --build
# open http://localhost:8080
```

**Without Docker** (Node 20+ and PostgreSQL 14+):

```bash
createuser raktsetu -P            # password: raktsetu
createdb raktsetu -O raktsetu
cd backend && npm install
NOTIFY_MODE=log SEED_DEMO=true LOCAL_WORKER_URL=http://localhost:8081 PUBLIC_BASE_URL=http://localhost:5173 PORT=8080 npm start
# second terminal
cd backend && NOTIFY_MODE=log LOCAL_CRON=true PORT=8081 npm run worker
# third terminal
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Locally, nothing is actually texted: every SMS and email lands in **Admin → Notification log**, with clickable donor links.

### Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@raktsetu.local` | `admin12345` |
| Hospital (verified, New Delhi) | `bloodbank@citycare.demo` | `hospital12345` |
| Donors (80 around Delhi) | `donor01@demo.raktsetu.local` … `donor80@…` | `donor12345` |

### Live demo script (viva)

1. Sign in as the hospital, raise a **Critical, A+, 3 units** request.
2. In a second window, sign in as admin and open the Notification log. The SMS alerts appear within seconds.
3. Open one link on your phone or narrow window, pick an ETA and tap **I'm coming**. The hospital dashboard flips that donor to "Coming" and reveals their phone number.
4. Raise an **O−** request: few donors match, so round 1 alerts only one or two. Within 5 minutes (critical) the worker widens the radius; when every radius is used up, the admin and hospital are alerted.
5. Mark donors **donated**. The request becomes fulfilled, donors get a thank-you SMS with their next eligible date, and anyone still on the way gets a stand-down SMS.

To have your real phone receive alerts on AWS, seed yourself: `SEED_MY_PHONE=+91XXXXXXXXXX SEED_MY_GROUP=O- npm run seed`.

## Deploy to AWS

Prerequisites: an AWS account, AWS CLI v2 configured, region `ap-south-1` (Mumbai) recommended.

```bash
export AWS_REGION=ap-south-1
export ADMIN_EMAIL=you@example.com
export DB_PASSWORD=ChooseALongPassword123     # letters + digits, 12+
export ADMIN_PASSWORD=ChooseAnAdminPassword

./infra/aws/setup.sh core      # ECR, SNS, SQS+DLQ, RDS, IAM (~10 min). Confirm the SNS email you receive.
./infra/aws/setup.sh envs      # Beanstalk application, web + worker environments
./infra/aws/setup.sh outputs   # copy ecr_repo_uri for the Chef node
```

**Set up the Chef CI node** (EC2 → Launch instance → Amazon Linux 2023, t3.small, IAM instance profile = `ci_profile` from outputs):

```bash
sudo dnf install -y git
git clone https://github.com/<you>/raktsetu.git && cd raktsetu/infra/chef
cp node.json.example node.json && nano node.json   # repo_url, ecr_repo_uri
sudo ./bootstrap.sh                                  # installs Cinc/Chef client and converges
sudo -u deploy raktsetu-deploy --force               # first build + deploy
```

From now on, every push to `main` is deployed automatically within 5 minutes (`systemctl list-timers raktsetu-deploy.timer`, logs in `/var/log/raktsetu/deploy.log`). Use a public repo, or put a read-only deploy key in `/home/deploy/.ssh` and an SSH `repo_url`.

**Then the CDN and frontend:**

```bash
./infra/aws/setup.sh cdn        # S3 + CloudFront; sets PUBLIC_BASE_URL on both envs
./infra/aws/setup.sh frontend   # build React, upload, invalidate → prints your https://xxxx.cloudfront.net URL
```

Prefer no CI node? `./deploy/deploy.sh` does the same build-push-deploy from any machine with Docker.

### SMS from India: read this before demo day

- New AWS accounts are in the **SNS SMS sandbox**: verify the phone numbers you will demo with (SNS console → Text messaging → Sandbox destination phone numbers).
- Production SMS to Indian numbers requires **DLT registration** (sender ID + message templates). Once registered, set `SMS_SENDER_ID`, `SMS_DLT_ENTITY_ID` and `SMS_DLT_TEMPLATE_ID` and the app passes them to SNS.
- Email alerts work immediately. Donors confirm one AWS subscription email.

### Cost and teardown

Roughly free-tier: single-instance environments and `db.t3.micro`. When done:

```bash
aws elasticbeanstalk terminate-environment --environment-name raktsetu-web
aws elasticbeanstalk terminate-environment --environment-name raktsetu-worker
aws s3 rm s3://$(aws cloudformation describe-stacks --stack-name raktsetu-cdn --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text) --recursive
aws cloudformation delete-stack --stack-name raktsetu-cdn
aws ecr delete-repository --repository-name raktsetu --force
aws cloudformation delete-stack --stack-name raktsetu-core   # RDS keeps a final snapshot
```

Terminate the CI EC2 instance as well.

## How the matching works

- **Compatibility:** red-cell rules (O− gives to everyone; Rh− recipients only get Rh− blood). Exact-group donors are alerted first so scarce O− blood isn't used up unnecessarily.
- **Eligibility:** age 18–65, available, and past the donation gap since their last donation (90 days male, 120 days female; configurable).
- **Rounds:** each round alerts up to `4 × units still needed` donors (min 8, max 25) within the current radius, nearest first. Donors already committed to another open request are skipped.
- **Escalation:** the worker cron widens the radius when a round goes unanswered: after 5 min (critical), 10 min (urgent) or 30 min (scheduled).
- **Safety:** accept is serialized with row locks, so a request can never get more acceptances than units; SNS/SQS delivery is at-least-once, so every handler is idempotent; poison messages are acknowledged, and failures retry five times before the DLQ.

## Project structure

```
backend/        Node 20 + Express 5 API and worker (one Docker image)
  src/routes/   auth, donors, requests, alerts (public token links), admin, public
  src/services/ matching engine, responses, SMS/email copy, profiles
  src/lib/      blood compatibility + eligibility, SNS notify/events, auth, validation
  test/         unit tests (npm test)
frontend/       React 18 + Vite SPA
deploy/         Beanstalk bundles (web, worker, cron.yaml, .ebextensions, ECR hook) + deploy.sh
infra/aws/      CloudFormation (core.yaml, cdn.yaml) + setup.sh
infra/chef/     raktsetu_ci cookbook, solo.rb, bootstrap.sh
```

## Environment variables (backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DB_SSL` (`off`/`require`/`verify`) | PostgreSQL connection; `verify` uses the bundled RDS CA |
| `JWT_SECRET` | 32+ chars in production |
| `NOTIFY_MODE` | `sns` (AWS) or `log` (local) |
| `SNS_EVENTS_TOPIC_ARN`, `SNS_DONOR_EMAIL_TOPIC_ARN`, `SNS_ADMIN_TOPIC_ARN` | SNS topics |
| `PUBLIC_BASE_URL` | Base for SMS links (your CloudFront URL) |
| `MATCH_RADII_KM`, `ESCALATE_*_MIN`, `COOLDOWN_*_DAYS` | Matching tuning |
| `SEED_DEMO`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First-run data |
| `LOCAL_WORKER_URL`, `LOCAL_CRON`, `TASK_SECRET` | Local stand-ins for SNS→SQS and cron.yaml |
