# E-Government Assistance System
### Municipality of Aluguinsan, Cebu

AI-powered citizen concern management system that matches residents with the appropriate public servants — fast, transparent, and multilingual.

**Live:** [aluguinsan-egov.online](https://aluguinsan-egov.online)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 + Recharts |
| Backend | Node.js + Express 5 |
| Database | MySQL 8 (Prisma ORM) |
| AI | Anthropic Claude API (ticket classification) |
| Auth | JWT + bcrypt + OTP (email & Firebase Phone Auth) |
| Real-time | Socket.IO |
| Email | Nodemailer (Hostinger SMTP) |
| PDF Export | jsPDF + html2canvas (client-side report generation) |
| Hosting | Hostinger (Node.js + MySQL) |

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aluguinsan.gov.ph | admin123 |
| Resident | juan.delacruz@example.com | resident123 |
| Servant | maria.santos@aluguinsan.gov.ph | servant123 |

> Citizens require OTP verification after login. Admin and servants log in directly.

---

## Setup

### Prerequisites

Node.js 20+, MySQL 8

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

**Backend** (`backend/.env`):
```env
DATABASE_URL=mysql://user:pass@localhost:3306/egov_db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=sk-ant-...
NODE_ENV=production
PORT=5000
CLIENT_URL=https://aluguinsan-egov.online
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@aluguinsan-egov.online
SMTP_PASS=your-smtp-password
EMAIL_FROM=info@aluguinsan-egov.online
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

**Frontend** (`frontend/.env`):
```env
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 3. Database setup

**Option A — Prisma CLI:**
```bash
cd backend
npx prisma migrate deploy
node prisma/seed.js
```

**Option B — SQL files (for phpMyAdmin / remote MySQL):**

Import in order via phpMyAdmin:
1. `sql/01-schema.sql` — Tables, indexes, departments, Prisma migrations
2. `sql/02-seed-admin.sql` — Admin account
3. `sql/03-seed-servants.sql` — 11 government servants
4. `sql/04-seed-citizens.sql` — 10 citizen accounts
5. `sql/05-add-message-attachments.sql` — Message attachments column

### 4. Run

```bash
# Backend
cd backend && npm start

# Frontend (dev)
cd frontend && npm run dev

# Frontend (production build)
cd frontend && npm run build
```

---

## Key Features

### Citizen Flow
- Trilingual interface (English / Filipino / Cebuano)
- Register with email/phone + password + **OTP verification** (account not created until verified)
- Login OTP: **SMS first** (Firebase) if phone provided, **email fallback** if SMS unavailable
- Registration OTP: phone → Firebase SMS (primary), email → SMTP (fallback)
- Auto-fallback to email if Firebase SMS fails (rate limit, billing, etc.)
- Login with phone number via **Firebase Phone Auth** (SMS OTP)
- Submit concerns via text, voice-to-text, or category selection with file attachments
- AI classifier routes concerns to the correct department automatically
- Real-time ticket tracking with status timeline
- Chat with assigned servant with **file attachments** (images, PDFs, docs, videos — up to 5 per message)
- Star ratings and comments on resolved tickets
- Browse announcements and barangay directory
- Edit profile with avatar photo upload

### Servant Flow
- Dashboard with assigned tickets, priority indicators, and SLA deadlines
- Reply to residents in ticket chat with **file attachments**
- Internal notes with file attachments (visible only to servants)
- Escalate tickets, update status (in-progress / resolved)
- Update availability (Available / Busy / Offline)

### Admin Flow
- Admin panel with tabs: Overview, Tickets, Servants, Citizens, SLA Breaches, Announcements, Directory
- System stats with 7-day trend chart and department breakdown
- Manage servants (create, edit, remove with department assignment)
- Manage citizens (edit, archive, delete — blocked if citizen has tickets)
- Archive/reactivate tickets (reactivation requires admin password)
- Permanently delete tickets with cascade (messages, attachments, notifications)
- Manage announcements (Info / Alert / Event categories, draft/published)
- Manage barangay directory (officials, emergency services, offices)

### Reports (Admin — Navbar)
- Standalone analytics page accessible from the admin navbar (`/reports`)
- Period selector: **1 Day**, **7 Days**, **15 Days**, **30 Days**, **90 Days**, **Annual**
- KPI summary: total tickets, resolved, pending, escalated, SLA compliance %, avg resolution time
- Ticket trend dual-line chart (created vs resolved per day)
- Status distribution donut chart, priority bar chart, department horizontal bar chart
- Public servant performance table with resolution rate progress bars and star ratings
- **Export CSV** — all data serialised to downloadable CSV file
- **Export PDF** — detailed multi-page A4 report with all charts and tables (jsPDF + html2canvas)

---

## Authentication

| Role | Login Method | OTP Channel |
|------|-------------|-------------|
| Citizen (CLIENT) | Email + password | Email OTP (SMTP) |
| Citizen (CLIENT) | Phone + password | SMS OTP (Firebase), auto-fallback to email |
| Citizen (CLIENT) | Firebase Phone Auth | Firebase handles verification (no separate OTP) |
| Servant | Email + password | None (direct login) |
| Admin | Email + password | None (direct login) |

**Registration:** Account is **not created** until OTP is verified. Pending data is held in memory for 5 minutes.

**Email validation:** Registration checks email format, blocks disposable providers (mailinator, yopmail, etc.), and verifies domain MX records.

**SMS fallback:** If Firebase SMS fails for any reason (rate limit, billing, captcha), the system automatically sends an email OTP instead. Users can also manually choose "Send to email instead".

---

## Department Routing

| Department | Code | Handles |
|------------|------|---------|
| Mayor's Office | MAYORS | General inquiries, documents, clearances |
| Municipal Engineering | ENGINEERING | Roads, floods, infrastructure |
| MSWDO | MSWDO | Social welfare, PWD, senior citizens, 4Ps |
| Rural Health Unit | RHU | Health, medical, immunization |
| MPDO | MPDO | Land use, business permits, zoning |
| MENRO | MENRO | Environment, logging, waste management |
| PNP | PNP | Peace and order, crime reports |
| Treasurer's Office | TREASURER | Tax, payments, clearances |

The AI classifier uses Claude to analyze concern text in any of the three supported languages and routes to the appropriate department.

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register (validates email, returns OTP — no DB record until verified) |
| POST | `/api/auth/unified-login` | Login (returns OTP for citizens, JWT for admin/servants) |
| POST | `/api/auth/verify-auth-otp` | Verify 6-digit OTP (creates account for registration) |
| POST | `/api/auth/resend-otp` | Resend auth OTP (supports `forceEmail` flag for SMS fallback) |
| POST | `/api/auth/verify-phone-otp` | Verify Firebase Phone Auth token for SMS OTP flow |
| POST | `/api/auth/firebase/verify-phone` | Verify Firebase Phone Auth token (passwordless login) |
| POST | `/api/auth/forgot-password` | Request password reset code |
| POST | `/api/auth/reset-password` | Reset password with code |
| GET | `/api/auth/profile` | Get current profile |
| PUT | `/api/auth/profile` | Update profile (multipart for avatar) |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tickets` | Submit concern (multipart, up to 5 files) |
| GET | `/api/tickets` | My tickets (paginated) |
| GET | `/api/tickets/:id` | Ticket detail + messages + attachments |
| POST | `/api/tickets/classify` | AI classify text |
| GET | `/api/tickets/servant/assigned` | Servant's assigned tickets |
| PATCH | `/api/tickets/:id/status` | Update status |
| POST | `/api/tickets/:id/message` | Send message with optional file attachments (multipart, up to 5 files) |
| PATCH | `/api/tickets/:id/escalate` | Escalate ticket |
| POST | `/api/tickets/:id/feedback` | Submit rating |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/tickets` | All tickets (filterable) |
| GET | `/api/admin/users` | All registered citizens (CLIENT role only) |
| PUT | `/api/admin/users/:id` | Edit citizen (name, email, phone, barangay, password, isVerified) |
| DELETE | `/api/admin/users/:id` | Delete citizen (blocked if has tickets) |
| PATCH | `/api/admin/users/:id/archive` | Toggle citizen archive (isVerified) |
| GET | `/api/admin/reports` | Analytics report (query: `range=1\|15\|365\|all`) |
| GET | `/api/admin/sla-breaches` | Overdue tickets |
| DELETE | `/api/admin/tickets/:id` | Permanently delete ticket (cascade) |
| PATCH | `/api/admin/tickets/:id/archive` | Archive or reactivate ticket (reactivate requires password) |

### Other
| Resource | Endpoints |
|----------|-----------|
| Servants | `GET/POST/PUT/DELETE /api/servants` |
| Announcements | `GET/POST/PUT/DELETE /api/announcements` |
| Directory | `GET/POST/PUT/DELETE /api/directory` |
| Notifications | `GET/PATCH /api/notifications` |

---

## SLA Policy

| Priority | Deadline | Use Case |
|----------|----------|----------|
| URGENT | 4 hours | Emergencies, public safety |
| NORMAL | 48 hours | Standard concerns |
| LOW | 5 days | Minor requests, inquiries |

---

## Project Structure

```
egov/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database models
│   │   └── seed.js                # Seed data
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js  # Auth, OTP, Firebase, email validation
│   │   │   └── ticketController.js
│   │   ├── routes/                # Express routers
│   │   ├── middleware/            # JWT, uploads, error handler
│   │   ├── services/
│   │   │   ├── classifier.js     # Claude AI classifier
│   │   │   └── notification.js   # Email, SMS, in-app
│   │   └── lib/
│   │       ├── prisma.js         # Prisma client
│   │       ├── socket.js         # Socket.IO
│   │       └── firebase.js       # Firebase Admin SDK
│   ├── firebase-service-account.json  # Firebase credentials (not in git)
│   └── .env
│
├── frontend/
│   ├── public/
│   │   └── site.webmanifest      # PWA manifest
│   ├── src/
│   │   ├── pages/                # 10 page components
│   │   ├── components/           # Navbar, ProfileModal, ErrorBoundary
│   │   ├── contexts/             # Auth, Language, Socket
│   │   ├── lib/firebase.js       # Firebase client SDK
│   │   ├── i18n/translations.js  # Trilingual strings
│   │   └── api/client.js         # Axios + JWT interceptor
│   └── .env
│
└── sql/                           # Manual DB setup files
    ├── 01-schema.sql
    ├── 02-seed-admin.sql
    ├── 03-seed-servants.sql
    ├── 04-seed-citizens.sql
    └── 05-add-message-attachments.sql
```

---

## Security

- JWT authentication (7-day expiry)
- bcrypt password hashing (cost factor 10)
- OTP verification for citizen accounts (SMS primary, email fallback)
- Email validation: format check, disposable domain blocking, MX record verification
- Registration deferred until OTP verified (no unverified accounts in DB)
- Rate limiting (200 req/15 min global, 20 req/15 min auth)
- Helmet.js security headers
- CORS with origin whitelist
- File upload validation (type + size limits, max 5 per message)
- Role-based access control (CLIENT / SERVANT / ADMIN)

---

## Mobile Support

- Responsive design with touch-friendly targets (44px minimum)
- iOS auto-zoom prevention (16px input fonts)
- Safe-area inset support for notched phones
- PWA installable from browser (Android + iOS)
- Active touch states on all interactive elements
- Split-panel auth page (branding panel on desktop, compact on mobile)

---

*Municipality of Aluguinsan, Province of Cebu, Philippines*
