# E-Government Assistance System
### Municipality of Aluguinsan, Cebu

AI-powered citizen concern management system that matches residents with the appropriate public servants — fast, transparent, and multilingual.

**Live:** [aluguinsan-egov.online](https://aluguinsan-egov.online)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Backend | Node.js + Express 5 |
| Database | MySQL 8 (Prisma ORM) |
| AI | Anthropic Claude API (ticket classification) |
| Auth | JWT + bcrypt + OTP (email & Firebase Phone Auth) |
| Real-time | Socket.IO |
| Email | Nodemailer (Hostinger SMTP) |
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
SEMAPHORE_API_KEY=your-semaphore-api-key
SEMAPHORE_SENDER_NAME=EGOV
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
- Register and login with email/phone + password + **OTP verification**
- Login with phone number via **Firebase Phone Auth** (SMS OTP)
- Submit concerns via text, voice-to-text, or category selection with file attachments
- AI classifier routes concerns to the correct department automatically
- Real-time ticket tracking with status timeline
- Chat with assigned servant (WhatsApp-style, live polling)
- Star ratings and comments on resolved tickets
- Browse announcements and barangay directory
- Edit profile with avatar photo upload

### Servant Flow
- Dashboard with assigned tickets, priority indicators, and SLA deadlines
- Reply to residents in ticket chat
- Internal notes (visible only to servants)
- Escalate tickets, update status (in-progress / resolved)
- Update availability (Available / Busy / Offline)

### Admin Flow
- Admin panel with tabs: Overview, Tickets, Servants, SLA Breaches, Announcements, Directory
- System stats with 7-day trend chart and department breakdown
- Manage servants (create, edit, remove with department assignment)
- Manage announcements (Info / Alert / Event categories, draft/published)
- Manage barangay directory (officials, emergency services, offices)

---

## Authentication

| Role | Login Method | OTP Required |
|------|-------------|-------------|
| Citizen (CLIENT) | Email/phone + password | Yes (email + SMS) |
| Citizen (CLIENT) | Firebase Phone Auth | No (Firebase handles verification) |
| Servant | Email + password | No |
| Admin | Email + password | No |

OTP is sent to both **email** (via SMTP) and **phone** (via [Semaphore](https://semaphore.co) SMS gateway). Set `SEMAPHORE_API_KEY` in backend `.env` to enable SMS delivery.

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
| POST | `/api/auth/register` | Register (returns OTP for citizens) |
| POST | `/api/auth/unified-login` | Login (returns OTP for citizens, JWT for admin/servants) |
| POST | `/api/auth/verify-auth-otp` | Verify 6-digit OTP after login/register |
| POST | `/api/auth/resend-otp` | Resend auth OTP |
| POST | `/api/auth/firebase/verify-phone` | Verify Firebase Phone Auth token |
| POST | `/api/auth/forgot-password` | Request password reset code |
| POST | `/api/auth/reset-password` | Reset password with code |
| GET | `/api/auth/profile` | Get current profile |
| PUT | `/api/auth/profile` | Update profile (multipart for avatar) |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tickets` | Submit concern (multipart, up to 5 files) |
| GET | `/api/tickets` | My tickets (paginated) |
| GET | `/api/tickets/:id` | Ticket detail + messages |
| POST | `/api/tickets/classify` | AI classify text |
| GET | `/api/tickets/servant/assigned` | Servant's assigned tickets |
| PATCH | `/api/tickets/:id/status` | Update status |
| POST | `/api/tickets/:id/message` | Send message / internal note |
| PATCH | `/api/tickets/:id/escalate` | Escalate ticket |
| POST | `/api/tickets/:id/feedback` | Submit rating |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/tickets` | All tickets (filterable) |
| GET | `/api/admin/sla-breaches` | Overdue tickets |

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
│   │   │   ├── authController.js  # Auth, OTP, Firebase, profile
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
    └── 04-seed-citizens.sql
```

---

## Security

- JWT authentication (7-day expiry)
- bcrypt password hashing (cost factor 10)
- OTP verification for citizen accounts (email + phone)
- Rate limiting (200 req/15 min global, 20 req/15 min auth)
- Helmet.js security headers
- CORS with origin whitelist
- File upload validation (type + size limits)
- Role-based access control (CLIENT / SERVANT / ADMIN)

---

## Mobile Support

- Responsive design with touch-friendly targets (44px minimum)
- iOS auto-zoom prevention (16px input fonts)
- Safe-area inset support for notched phones
- PWA installable from browser (Android + iOS)
- Active touch states on all interactive elements

---

*Municipality of Aluguinsan, Province of Cebu, Philippines*
