# 🏗️ MediSync Phase 2 — Technical Design Document

This document outlines the architectural decisions, logic flows, and database designs for **Phase 2 (Clinical Operations)**.

---

## 1. Appointment Scheduling Engine (Phase 2.1)

The goal is to move from a static availability model to a dynamic, relational system that supports complex scheduling needs.

### 🗓️ Logic Flow: Slot Generation
To generate available slots for a doctor on a specific date, the `SlotGeneratorService` follows these steps:

1.  **Identify Base Windows**: Fetch all active `DoctorAvailability` rows for that `DayOfWeek`.
2.  **Filter by Exceptions**: Check the `DoctorDayOff` table for that specific date. If it's a day off, return zero slots.
3.  **Calculate Working Blocks**: For each availability window (e.g., 09:00 - 12:00 and 14:00 - 17:00):
    *   Subdivide into raw slots based on `slotDuration`.
4.  **Subtract Breaks**: Remove any slots that overlap with time ranges in the `DoctorBreak` table.
5.  **Subtract Booked Appointments**: Fetch all `CONFIRMED` or `PENDING` appointments for that date and remove overlapping slots.
6.  **Concurrency Protection**: Use **Redis Distributed Locks** during the actual booking process to prevent two patients from grabbing the same slot simultaneously.

### 🗄️ Database Changes
*   **DoctorAvailability**: Normalized from columns (mondayStartTime, etc.) to a separate table.
*   **DoctorBreak**: New table linked to availability to allow unlimited breaks per day.
*   **DoctorDayOff**: New table for one-off exceptions (vacations, emergencies).

---

## 2. Advanced Prescription System (Phase 2.2)

Moving beyond simple JSON storage to a relational, template-based system with safety checks.

### 💊 Logic Flow: Prescription Creation
1.  **Template Selection (Optional)**: Doctor can pull a `PrescriptionTemplate` to pre-fill medications.
2.  **Interaction Check**: Before saving, the system calls the `DrugInteractionService` (integrating with OpenFDA) to check for dangerous combinations.
3.  **Relational Storage**: Medications are stored in a dedicated `PrescriptionMedication` table for better querying and reporting.
4.  **PDF Generation**: A background job uses `pdfkit` to generate a professional, watermarked PDF for the patient.

---

## 3. Medical Records V2 (Phase 2.3)

Ensuring data integrity and security through versioning, encryption, and audit logs.

### 🛡️ Security & Versioning Flow
*   **Versioning**: When a file is updated, the original record remains unchanged. A new `MedicalRecordVersion` is created, allowing users to view the history of changes.
*   **AES-256 Encryption**:
    1.  File is uploaded.
    2.  `EncryptionService` encrypts the file at rest using a key managed via an external KMS.
    3.  Only authorized users (patient or doctors with a `RecordShare` entry) can trigger decryption.
*   **Audit Logging**: Every "View", "Download", or "Share" action is recorded in `FileAuditLog` with IP and Timestamp.

---

## 4. Clinic & Doctor Profile System (Phase 2.4)

Enabling multi-tenant clinic support and public-facing profiles.

### 🏥 Clinic Management
*   **Verification Workflow**: Clinics are created in a `PENDING` state. An Admin must review license documents before the clinic is marked `isVerified`.
*   **Insurance Normalization**: A global `InsuranceProvider` table allows doctors to select which plans they accept, which is then searchable by patients.
*   **Reviews**: Patients can only review a doctor *after* a completed appointment to ensure authenticity.

---

---

## 📁 Actual Phase 2 Directory Structure

The following structure represents the implemented Phase 2 modules and their responsibilities:

```bash
src/
├── appointments/
│   ├── controllers/         # Endpoints for appointments & availability
│   ├── service/             # Appointment, Availability, & SlotGenerator services
│   ├── dto/                 # Request/Response validation
│   ├── enums/               # Appointment-specific enums
│   └── policies/            # Business logic rules (refunds, statuses)
├── prescriptions/
│   ├── services/            # Core logic, PDF generation, renewal tracking
│   ├── dto/                 # Validation for prescriptions and renewals
│   └── (module root)        # Controller & Module definition
├── medical-records/
│   ├── dto/                 # Record creation and sharing DTOs
│   ├── types/               # Custom types for encryption metadata
│   └── (module root)        # Service, Controller, & Module definition
├── clinics/
│   ├── dto/                 # Clinic profile and review DTOs
│   └── (module root)        # Services & controllers for clinics and profiles
└── common/
    ├── audit/               # File access audit logging system
    ├── encryption/          # AES-256 encryption service
    ├── storage/             # S3 storage integration
    ├── redis-lock/          # Distributed locking for double-booking prevention
    └── cache/               # Caching services for clinics and doctor profiles
```

---

## 🎯 Key Improvements Summary (Phase 1 → Phase 2)

| Feature | Before (Phase 1) | After (Phase 2) | Technical Impact |
| :--- | :--- | :--- | :--- |
| **Availability** | Static JSON columns | Relational rows | Supports multiple windows/breaks per day |
| **Prescriptions** | Simple JSON array | Relational medications | Safety checks via OpenFDA API |
| **Medical Records** | Single file | Versioned & Encrypted | HIPAA-style audit logging & version history |
| **Clinics** | Single doctor-only | Multi-clinic & Verified | Normalized insurance & verified workflows |

---

## 📄 Detailed Feature Breakdown

### 1. Appointment Engine (Relational)
*   **Availability Pattern Management**: Full CRUD for weekly recurring patterns.
*   **Break & Day-off Support**: Unlimited breaks per day and specific date exceptions (vacations).
*   **Slot Generation Algorithm**: Timezone-agnostic minutes-based calculation.

### 2. Advanced Prescriptions
*   **Drug Interaction Checker**: External API integration to prevent medical errors.
*   **Template System**: Reusable medication combos for doctors.
*   **Renewal Workflow**: Controlled patient requests with maximum renewal limits.

### 3. Secure Medical Records
*   **Encryption at Rest**: AES-256 via external KMS provider.
*   **Scoped Sharing**: Patient-controlled access with expiry dates.
*   **Audit Trail**: Immutable log of every file access event.

### 4. Clinic Ecosystem
*   **Verification Engine**: Multi-step license verification for clinics.
*   **Insurance Registry**: Normalized provider list linked to clinics and doctors.
*   **Moderated Reviews**: Authentic patient feedback system with abuse detection.

---

## 🛠️ Implementation Progress Tracking

| Module | Status | Technical Notes |
| :--- | :--- | :--- |
| **Appointments** | ✅ Completed | Fully implemented with SlotGenerator and Redis locks. |
| **Prescriptions** | ✅ Completed | Includes PDF generation and Drug Interaction logic. |
| **Medical Records** | ✅ Completed | V2 API implemented with S3 storage and AES-256 encryption. |
| **Clinics** | ✅ Completed | Doctor profiles, caching, and clinic verification added. |

---

*Last Updated: June 2026*

---

## 📡 Appointment / Scheduling — API Endpoints (Phase 2.1)

> Base prefix is your app `globalPrefix` (e.g. `/api` in `main.ts`), plus controller paths below.

### Availability
- `POST /availability`
  - Create availability for a doctor (weekly recurring window)
- `POST /availability/bulk`
  - Bulk create multiple availability windows
- `PATCH /availability/:id`
  - Update an availability window
- `DELETE /availability/:id`
  - Soft delete availability window

- `GET /availability/doctor/:doctorId`
  - Get doctor availability windows

#### Breaks
- `POST /availability/breaks`
  - Create a doctor break window (lunch, prayer, etc.)
- `GET /availability/breaks/:doctorId`
  - Get doctor breaks
- `DELETE /availability/breaks/:id`
  - Delete doctor break

#### Day-offs
- `POST /availability/day-offs`
  - Create a doctor day-off (date exception)
- `GET /availability/day-offs/:doctorId`
  - Get doctor day-offs
- `DELETE /availability/day-offs/:id`
  - Delete doctor day-off

### Appointments
- `POST /appointments`
  - Book an appointment
- `PATCH /appointments/:id/cancel`
  - Cancel an appointment
- `PATCH /appointments/:id/reschedule`
  - Reschedule an appointment
- `PATCH /appointments/:id/confirm`
  - Confirm an appointment (doctor confirmation)
- `PATCH /appointments/:id/complete`
  - Complete appointment (placeholder/implementation pending)

- `GET /appointments/doctor/:doctorId`
  - Get appointments for a doctor (optional `status` query)
- `GET /appointments/patient/:patientId`
  - Get appointments for a patient (optional `status` query)
- `GET /appointments/:id`
  - Get a single appointment (optional `userId` query for ownership)

### Slots
- `GET /slots/available?doctorId=...&startDate=...&endDate=...`
  - Get available slots for a doctor in a datetime range (max 100 in service response)
- `GET /slots/range/:doctorId?start=...&end=...`
  - Get generated slots for a doctor between two datetimes
- `GET /slots/next?doctorId=...&days=...`
  - Get next available slots from “now” (default window ~7 days; response capped)
