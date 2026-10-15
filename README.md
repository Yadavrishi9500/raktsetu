# 🩸 RaktSetu: Emergency Blood Donor Alert Network

![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Cloud_Ready-232F3E?style=flat-square&logo=amazon-aws&logoColor=white)

A hospital raises a blood request. RaktSetu finds compatible, eligible donors nearby and texts them a secure link. Donors tap "I'm coming", and the hospital's dashboard updates live. If too few respond, the system's automated worker widens the search radius (5 → 10 → 25 → 50 km) until the request is covered.

## ✨ Key Features
* **Intelligent Matching Engine:** Prioritizes exact blood group matches and calculates eligibility based on previous donation gaps.
* **Automated Escalation:** Background workers automatically expand the search radius if critical requests remain unfulfilled.
* **Live Hospital Dashboard:** Real-time updates as donors accept requests.
* **Event-Driven Architecture:** Uses AWS SNS for fan-out messaging and SMS/Email delivery, and SQS for queuing.

## 🏗️ System Architecture

```text
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
                                       SNS SMS to phones + SNS email
