## 🔗 Quick Links
- 🚀 [Live Interactive API Documentation (Apidog Sandbox)](https://e2bnqv34pt.apidog.io)

## 🏥 MediSync API

🚀 **Deployed on AWS and Ready for Production!**
📚 **Live API Documentation:** [Apidog](https://e2bnqv34pt.apidog.io/)

**MediSync** is a professional **Medical follow-up & Records Management System** built with **NestJS**, designed to streamline healthcare processes between doctors and patients.

### ❓ Problem Statement

Healthcare in many regions, including Egypt, still relies heavily on fragmented paper records, leading to lost medical histories, prescription errors, and inefficient doctor-patient communication. MediSync exists to bridge this gap by providing a secure, centralized digital platform for reliable healthcare management.

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

---

## 🛠️ What We Are Doing (Current Features)

The current version of MediSync API provides a robust foundation for digital healthcare:

- 👤 **Multi-role Authentication** — Specialized workflows for Patients, Doctors, and Admins.
- 🔐 **Advanced Security** — Secure email verification with OTP, password reset flow, and Google OAuth2 integration.
- 📱 **Device-based Sessions** — Refresh tokens are bound to specific devices; users can view active device sessions and revoke them (e.g., `GET /auth/sessions`, `DELETE /auth/sessions/:id`).
- 💊 **Digital Prescriptions** — Doctors can create, manage, and share prescriptions securely.
- 🔗 **Connection System** — Seamless connection requests between doctors and patients via invitations or **QR Code Scanning**.
- 💬 **Real-time Communication** — Integrated Chat System using WebSockets for direct messaging between doctors and patients.
- 🧾 **QR Verification** — Secure QR code generation for clinic check-ins and prescription validation.
- 📂 **Medical Records** — Secure file management for medical reports, lab results, and X-rays.
- 🔔 **Instant Notifications** — Real-time in-app and email notifications for appointments, requests, and messages.
- ⚡ **Performance Optimized** — Layered caching with Redis and database connection pooling.

---

## 🧠 Tech Stack

| Category          | Technology                                               |
| ----------------- | -------------------------------------------------------- |
| **Framework**     | [NestJS](https://nestjs.com/) (Node.js)                  |
| **Language**      | TypeScript                                               |
| **Database**      | **PostgreSQL** with [Prisma ORM](https://www.prisma.io/) |
| **Real-time**     | [Socket.io](https://socket.io/) (WebSockets)             |
| **Caching**       | **Redis** (ioredis)                                      |
| **Auth**          | Passport.js (JWT, Local, Google OAuth2)                  |
| **Documentation** | [Swagger (OpenAPI 3.0)](https://swagger.io/)             |
| **Communication** | Nodemailer with SMTP & Templates                         |
| **Validation**    | class-validator & class-transformer                      |

---

## 🏗️ Project Structure

```bash
src/
├── auth/                  # Advanced Auth (JWT, OAuth2, Device Sessions)
├── users/                 # Core User & Profile management
├── patients/              # Patient-specific logic & records
├── doctors/               # Doctor-specific logic & specializations
├── prescriptions/         # Prescription management system
├── requests/              # Connection & follow-up request logic
├── chat/                  # Real-time WebSocket messaging
├── notifications/         # Multi-channel notification system
├── qr/                    # QR Token generation & verification
├── prisma/                # Database schema & client management
└── common/                # Shared decorators, guards, and interceptors
```

---

## 🏛️ System Architecture

### 📊 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                      │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│   Mobile App         │   Web App            │   Admin Dashboard             │
│   (React Native)     │   (React/Vue)        │   (React)                     │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY & LOAD BALANCER                              │
│                     (NGINX / AWS ALB)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NESTJS BACKEND (Main Server)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Auth        │  │  Users       │  │  Patients    │  │  Doctors     │     │
│  │  Module      │  │  Module      │  │  Module      │  │  Module      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Appointments │  │ Prescriptions│  │  Medical     │  │  Requests    │     │
│  │ Module       │  │  Module      │  │  Records     │  │  Module      │     │
│  │ (NEW - P2)   │  │  Module      │  │  Module      │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Chat        │  │  QR          │  │  Payments    │  │  Notification│     │
│  │  Module      │  │  Module      │  │  Module      │  │  Module      │     │
│  │  (WebSocket) │  │              │  │  (NEW - P2)  │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              SHARED SERVICES & GUARDS                               │    │
│  │  Auth Guard │ RBAC Guard │ Logger │ Email │ File Upload │ Cron      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
         ↓                      ↓                       ↓
    ┌────────────┐       ┌──────────────┐        ┌──────────────┐
    │ PostgreSQL │       │    Redis     │        │  Socket.io   │
    │ (Primary DB)       │ (Cache/Queue)│        │ (Real-time)  │
    └────────────┘       └──────────────┘        └──────────────┘
         ↓
    ┌──────────────────────────────────────────────────────────┐
    │  Data Persistence Layer (Prisma ORM)                     │
    │  • Connection pooling                                    │
    │  • Migration management                                  │
    │  • Query optimization                                    │
    └──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES & INTEGRATIONS                       │
├──────────────┬────────────────┬──────────────┬─────────────┬────────────────┤
│   Google     │   Nodemailer   │   AWS S3     │   Paymob    │  Twilio SMS    │
│   OAuth2     │   (Email)      │  (File Store)│  (Payments) │  (Alerts)      │
└──────────────┴────────────────┴──────────────┴─────────────┴────────────────┘
```

### 🏗️ Layered Architecture (Vertical Slice)

```
REQUEST → API Controller (DTOs validation)
              ↓
        Service Layer (Business Logic)
              ↓
        Repository/ORM (Prisma)
              ↓
        PostgreSQL + Redis Cache
              ↓
        RESPONSE (JSON + Status Code)
```

#### Example Flow: Appointment Booking

```
Patient submits booking request
    ↓
AppointmentController.bookAppointment()
    ↓
AppointmentService.createAppointment()
    - Validate doctor availability (Redis cache check first)
    - Check for double booking (DB lock)
    - Create appointment record
    - Publish event to notification queue
    - Return appointment with confirmation
    ↓
Database stored, Cache updated, Notification queued
    ↓
WebSocket notification sent to doctor in real-time
```

---

## 🎯 Roadmap

> [!NOTE]
> Detailed technical logic and design flows for the upcoming phases can be found in our [Phase 2 Design Document](docs/PHASE_2_DESIGN.md).

### Phase 1: Foundation (MVP) ✅

- [x] Multi-role Auth & Email Verification
- [x] Google OAuth Integration
- [x] Device-based session management
- [x] Connection requests (Doctor-Patient)
- [x] Digital Prescriptions & QR Verification
- [x] Real-time Chat & Notifications
- [x] File management for medical records

### Phase 2: Clinical Operations ✅

_Turning the app from a "chat tool" into a professional clinic management system._

#### 2.1 — Appointment Scheduling Engine

- [x] Doctors define availability slots (days, hours, duration per session).
- [x] Patient booking with **Redis Locks** to prevent double-booking.
- [x] State management: `PENDING` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED` → `CANCELLED`.
- [x] Auto-reminders via **@nestjs/schedule** (24h/1h before).
- [x] Calendar export (.ics) for Google/Apple Calendar.

#### 2.2 — Advanced Prescription System

- [x] Prescription templates for reusable medication combos.
- [x] **Drug Interaction Checker** (Integration with OpenFDA or similar API).
- [x] Expiry tracking and patient renewal requests.
- [x] **Pharmacy-ready PDF generation** with doctor signature watermarks (pdfkit).

#### 2.3 — Medical Records (API v2)

- [x] File versioning and auto-categorization (LAB_RESULT, XRAY, etc.).
- [x] **End-to-End Encryption (AES-256)** for files at rest.
- [x] S3 Storage Integration for scalable file management.
- [x] **File Access Audit Logs** (HIPAA-style tracking).
- [x] Scoped record sharing (Patient shares specific files with specific doctors).

#### 2.4 — Clinic & Doctor Profile System

- [x] Multi-clinic management (different fees/schedules per clinic).
- [x] Admin-led Clinic verification (license uploads).
- [x] Patient reviews/ratings with caching support.
- [x] Specialization tags and education history.

---

### Phase 3: Intelligence & Analytics 🧠

_Adding data value on top of clinical operations._

#### 3.1 — Health Dashboard & Vitals Tracking

- Manual vital logging (BP, Glucose, Weight, Heart Rate).
- Custom vital monitoring plans per patient.
- Trend charts and anomaly alerts for elevated readings.
- Integration with wearables (Fitbit/Apple Health webhooks).

#### 3.2 — AI-Powered Features

- **Medical Report Summarization**: Lab PDF analysis using LLM APIs (GPT/Claude).
- **Symptom Triage**: AI Urgency suggestions based on chat (with legal disclaimer).
- **Prescription Auto-fill**: AI-suggested medications based on diagnosis.
- **Smart Search**: Semantic search across records using **pgvector** embeddings.
- **FAQ Chatbot**: AI assistant for dosage reminders and scheduling queries.

#### 3.3 — Reporting & Admin Analytics

- Admin dashboards (User growth, activity, most active doctors).
- Doctor performance metrics (Response time, completion rate).
- Financial reporting and patient engagement analytics.

#### 3.4 — Notification System V2

- **Push Notifications** via Firebase Cloud Messaging (FCM).
- SMS alerts via Twilio for critical updates.
- Notification preferences center and digest emails.

---

### Phase 4: Platform & Ecosystem 🏗️

_Transforming MediSync into a complete healthcare ecosystem._

#### 4.1 — Telemedicine (Video Consultations)

- **WebRTC Peer-to-Peer calls** (mediasoup/LiveKit).
- Virtual Waiting Room & session admission.
- In-call features: Screen share, file share, and encrypted recording.
- Bandwidth-adaptive streaming for low-connection areas.

#### 4.2 — Payment & Billing System

- **Payment Integration** (Paymob/Stripe) for appointment fees.
- PDF Invoice generation and automated refund engine.
- Doctor payout system (Platform commission management).
- Insurance claim form generation (Egyptian insurance structures).

#### 4.3 — Third-Party Integrations (Webhooks)

- **Pharmacy Integration**: Direct prescription delivery to linked pharmacies.
- **Lab Integration**: Direct results upload from labs to patient records.
- **HL7 FHIR-compatible endpoints** for EMR system compatibility.
- Secure Webhook registry with HMAC-SHA256 verification.

#### 4.4 — Multi-Tenant Architecture

- Hospital organization support with data isolation.
- Hospital Admin roles for managing affiliated doctors.
- White-label branding support and per-tenant feature flags.

---

## ⚙️ Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis (for chat & caching)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ahmedsalah/MediSync-API.git
cd medisync-backend

# 2. Install dependencies
npm install

# 3. Environment Setup
cp .env.example .env
# Edit .env with your specific configuration (see table below)

# 4. Database Initialization
npx prisma generate
npx prisma migrate dev

# 5. Start the Server
npm run start:dev
```

### 📄 Environment Variables

| Key                      | Description                      | Default / Example                          |
| :----------------------- | :------------------------------- | :----------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string     | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET`             | Secret key for Access Tokens     | `your-secret-key`                          |
| `JWT_REFRESH_SECRET`     | Secret key for Refresh Tokens    | `your-refresh-secret`                      |
| `JWT_EXPIRES_IN`         | Access Token expiration          | `15m`                                      |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token expiration         | `7d`                                       |
| `PORT`                   | Server port                      | `3000`                                     |
| `API_PREFIX`             | Base URL prefix for API          | `api/v1`                                   |
| `MAX_FILE_SIZE`          | Maximum upload size in bytes     | `10485760` (10MB)                          |
| `UPLOAD_DEST`            | Local directory for file uploads | `./uploads`                                |
| `SMTP_HOST`              | SMTP server for emails           | `smtp.gmail.com`                           |
| `SMTP_USER`              | SMTP username                    | `user@gmail.com`                           |
| `SMTP_PASS`              | SMTP password                    | `app-password`                             |
| `CORS_ORIGIN`            | Allowed CORS origins             | `http://localhost:3000`                    |

---

## 🧪 Testing

We use **Jest** for comprehensive testing to ensure API stability and security.

```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run end-to-end (E2E) tests
npm run test:e2e

# Generate test coverage report
npm run test:cov
```

---

## 📈 Performance & Scalability

- **Database Optimization**: Strategic indexing and Prisma connection pooling.
- **Caching**: Redis-backed caching for frequently accessed medical metadata.
- **Rate Limiting**: Throttler protection on sensitive auth and API endpoints.
- **Security Headers**: Production-ready configuration with Helmet.js.

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

🚀 **Production API (AWS)**: Deployed and Ready
🧑‍💻 **Live API Docs**: [https://e2bnqv34pt.apidog.io/](https://e2bnqv34pt.apidog.io/)

**Built with ❤️ for better healthcare management**
