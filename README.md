# E-Government Assistance System
### Municipality of Aloguinsan, Cebu

AI-powered citizen concern management system that matches residents with the appropriate public servants — fast, transparent, and multilingual.

**Live:** [aloguinsan-egov.online](https://aloguinsan-egov.online)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18.3 · Vite 5.4 · Tailwind CSS 3.4 · Recharts 2.15 |
| Backend | Node.js 18 · Express 5.2 |
| Database | MySQL 8 · Prisma ORM 6.19 (10 models, 10 enums) |
| AI — Classification | Claude Haiku 4.5 (`claude-haiku-4-5`) — department routing via tool-use |
| ID Verification | Tesseract.js 7.0 (client-side OCR, eng+fil) — name matching + ID keyword detection |
| Auth | JWT · bcryptjs · OTP (email + Firebase Phone Auth) · strong password policy |
| Real-time | Socket.IO 4.8 (server + client) |
| Email | Nodemailer 6.10 (Hostinger SMTP) |
| Phone OTP | Firebase Admin SDK 13.7 (server) · Firebase 12.11 (client) |
| PDF Export | jsPDF 4.2 + html2canvas 1.4 (client-side) |
| Icons | Lucide React 0.577 |
| HTTP Client | Axios 1.13 (JWT interceptor) |
| Security | Helmet 8.1 · express-rate-limit 7.5 · CORS 2.8 |
| Compression | compression 1.8 (gzip) |
| File Uploads | Multer 2.1 (avatars, IDs, attachments) |
| Hosting | Hostinger (Node.js + MySQL) |

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aloguinsan.gov.ph | Admin123! |
| Resident | juan.delacruz@example.com | Resident123! |
| Servant | maria.santos@aloguinsan.gov.ph | Servant123! |

> Citizens require OTP verification after login. Admin and servants log in directly.

---

## Setup

### Prerequisites

Node.js 18+ (see `.nvmrc`), MySQL 8

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

**Backend** (`backend/.env`) — see `backend/.env.example` for full template:
```env
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u856082912_egovdb
DB_USER=u856082912_egov
DB_PASS=your_database_password
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE_NAME

# Auth
JWT_SECRET=supersecret_change_this_in_production_minimum_32_chars
JWT_EXPIRES_IN=7d

# AI (Anthropic Claude — powers ticket classification)
ANTHROPIC_API_KEY=sk-ant-...

# Server
NODE_ENV=production
PORT=5000
CLIENT_URL=https://aloguinsan-egov.online

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10

# SMTP (Hostinger Email — used for OTP, password reset, notifications)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@aloguinsan-egov.online
SMTP_PASS=your_email_password
EMAIL_FROM=info@aloguinsan-egov.online
```

> **Note:** Place your `firebase-service-account.json` in the backend root for Firebase Phone Auth.

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
npx prisma generate          # Generate Prisma client
npx prisma migrate deploy    # Run all migrations
node prisma/seed.js          # Seed departments, admin, servants, citizens
```

**Option B — SQL files (for phpMyAdmin / remote MySQL):**

Import in order via phpMyAdmin:
1. `sql/01-schema.sql` — Tables, indexes, departments, Prisma migrations
2. `sql/02-seed-admin.sql` — Admin account
3. `sql/03-seed-servants.sql` — 11 government servants
4. `sql/04-seed-citizens.sql` — 10 citizen accounts
5. `sql/05-add-message-attachments.sql` — Message attachments column
6. `sql/06-seed-directory.sql` — Barangay directory entries (23 records)
7. `sql/07-add-user-id-photo.sql` — ID photo URL column for citizen verification
8. `sql/08-add-user-id-status.sql` — ID verification status enum column + backfill

### 4. Run

```bash
# Backend
cd backend && npm start          # Production
cd backend && npm run dev        # Development (nodemon auto-restart)

# Frontend
cd frontend && npm run dev       # Development (Vite HMR)
cd frontend && npm run build     # Production build → dist/
cd frontend && npm run preview   # Preview production build locally
```

### Available Scripts

**Backend:**
| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node src/index.js` | Production server |
| `npm run dev` | `nodemon src/index.js` | Dev server with auto-restart |
| `npm run db:generate` | `prisma generate` | Regenerate Prisma client |
| `npm run db:migrate` | `prisma migrate dev` | Create/run new migration |
| `npm run db:seed` | `node prisma/seed.js` | Seed database |
| `npm run db:reset` | `prisma migrate reset --force` | Reset DB + reseed |
| `npm run db:studio` | `prisma studio` | Open Prisma Studio GUI |

**Frontend:**
| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `vite` | Dev server with HMR |
| `npm run build` | `rm -rf dist && vite build` | Clean production build |
| `npm run preview` | `vite preview` | Preview built dist |
| `npm run clean` | `rm -rf dist` | Remove build output |

---

## Key Features

### Citizen Flow
- Trilingual interface (English / Filipino / Cebuano)
- Register with email/phone + password + **OTP verification** (account not created until verified)
- **Strong password enforcement** — minimum 8 characters, requires uppercase, lowercase, number, and special character; live strength indicator during registration
- **OCR-based ID verification** — upload or camera-capture a government-issued ID; Tesseract.js (eng+fil) scans the document, matches the registrant's name, and detects Philippine ID keywords
- **Three-tier ID verification results:**
  - **Green** — name matched + ID keywords detected → auto-verified → auto-login after OTP
  - **Blue** — ID accepted but name not matched → account created as PENDING_REVIEW, blocked from login until admin approves
  - **Red** — validation failed (unreadable, not an ID) → retry
- Login OTP: **SMS first** (Firebase) if phone provided, **email fallback** if SMS unavailable
- Submit concerns via text, voice-to-text, or category selection with file attachments
- AI classifier routes concerns to the correct department automatically
- Real-time ticket tracking with status timeline
- Chat with assigned servant with **file attachments** (images, PDFs, docs, videos — up to 5 per message)
- Star ratings and comments on resolved tickets
- **Real-time notifications** — sound alerts, announcement popups, unread badge
- Browse announcements and barangay directory
- Edit profile with avatar photo upload
- **FAQs & Self-Help** section with department contact directory

### Servant Flow
- Dashboard with assigned tickets, priority indicators, and SLA deadlines
- Reply to residents in ticket chat with **file attachments**
- Internal notes with file attachments (visible only to servants)
- Escalate tickets, update status (in-progress / resolved)
- Update availability (Available / Busy / Offline)
- **Real-time socket notifications** — ticket assignments, citizen replies (socket-only, no DB persistence)

### Admin Flow
- **Sidebar navigation** — Servants, Citizens, and Departments each have dedicated sidebar links (`/admin?tab=servants`, `/admin?tab=citizens`, `/admin?tab=departments`)
- **Inline tab bar** — Overview, Tickets, SLA Breaches
- System stats with 7-day trend chart and department breakdown
- Manage servants (create, edit, remove with department assignment)
- Manage citizens (edit, archive, delete — blocked if citizen has open tickets)
- Manage departments (create, edit)
- **ID review workflow** — pending ID count badge on Citizens tab; full-screen ID photo viewer with Approve / Reject actions
- Archive/reactivate tickets (reactivation requires admin password)
- Permanently delete tickets with cascade (messages, attachments, notifications)
- Manage announcements (Info / Alert / Event categories, draft/published)
- Real-time announcement broadcast via Socket.IO with popup notifications
- Manage barangay directory (officials, emergency services, offices)

### Reports (Admin)
- Standalone analytics page accessible from the admin sidebar (`/reports`)
- Period selector: **1 Day**, **7 Days**, **15 Days**, **30 Days**, **90 Days**, **Annual**
- KPI summary: total tickets, resolved, pending, escalated, SLA compliance %, avg resolution time
- Ticket trend dual-line chart (created vs resolved per day)
- Status distribution donut chart, priority bar chart, department horizontal bar chart
- Public servant performance table with resolution rate progress bars and star ratings
- **Export CSV** — all data serialised to downloadable CSV file
- **Export PDF** — detailed multi-page A4 report with all charts and tables (jsPDF + html2canvas)

---

## Authentication & ID Verification

### Login Methods

| Role | Login Method | OTP Channel |
|------|-------------|-------------|
| Citizen (CLIENT) | Email + password | Email OTP (SMTP) |
| Citizen (CLIENT) | Phone + password | SMS OTP (Firebase), auto-fallback to email |
| Citizen (CLIENT) | Firebase Phone Auth | Firebase handles verification (no separate OTP) |
| Servant | Email + password | None (direct login) |
| Admin | Email + password | None (direct login) |

**Registration:** Account is **not created** until OTP is verified. Pending data is held in memory for 5 minutes.

**Password policy:** Minimum 8 characters with at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character. Enforced on both client and server. Applied to registration, password reset, and profile password change.

**Email validation:** Registration checks email format, blocks disposable providers (mailinator, yopmail, etc.), and verifies domain MX records.

**SMS fallback:** If Firebase SMS fails for any reason (rate limit, billing, captcha), the system automatically sends an email OTP instead.

### ID Verification Flow

Citizens must upload or capture a valid government-issued ID during registration. Verification uses **Tesseract.js** (client-side OCR with English + Filipino language packs):

| Step | What Happens |
|------|-------------|
| 1. Basic checks | File type (JPEG/PNG/WebP), size (50 KB–5 MB), dimensions (min 300x200), blank detection via pixel variance |
| 2. OCR scan | Tesseract.js extracts text with progress indicator; minimum 5 words required |
| 3. Name matching | Splits registered name into parts, checks 50%+ match against normalized OCR text |
| 4. ID keyword detection | Scans for 25+ Philippine ID keywords (republic, philippines, driver, license, passport, voter, sss, etc.) |

| Result | Color | Condition | Effect |
|--------|-------|-----------|--------|
| Verified | Green | Name matched + ID keywords found | `idStatus: VERIFIED` — auto-login after OTP |
| Pending Review | Blue | ID accepted but name not matched | `idStatus: PENDING_REVIEW` — cannot login until admin approves |
| Failed | Red | No ID keywords, unreadable, not an ID | Registration blocked — user must retry |
| OCR Failure | Blue | Tesseract error (slow device, etc.) | Graceful fallback — accepted for manual staff review |

**ID reupload:** Users with `PENDING_REVIEW` or `REJECTED` status can reupload from the login screen. If the new OCR matches, status changes to `VERIFIED` immediately.

---

## Notification System

| Role | Channel | Persistence |
|------|---------|-------------|
| Citizen | Socket.IO + DB-backed | Yes — stored in Notification table, 50 most recent shown |
| Servant | Socket.IO only | No — real-time only (ticket assignments, citizen replies) |
| Admin | None | Excluded from all notifications |

- **Sound alerts** — two-tone ding on new notifications
- **Announcement popups** — toast notification when admin publishes a new announcement
- **Unread badge** — notification bell with count badge (citizens and servants only)

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

The AI classifier uses Claude Haiku 4.5 to analyze concern text in any of the three supported languages and routes to the appropriate department via tool-use.

---

## Barangays

Angilan, Bojo, Bonbon, Esperanza, Kandingan, Kantabogon, Kawasan, Olango, Poblacion, Punay, Rosario, Saksak, Tampaan, Tuyokon, Zaragosa

---

## API Endpoints

> All endpoints are prefixed with `/api`. JWT = Bearer token required. Role = additional role check.

### Auth (`/api/auth`) — 16 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/register` | — | Register with ID photo (multipart). Returns OTP — account not created until verified |
| POST | `/verify-id` | — | Verify uploaded ID photo (multipart: image + name). Returns validity, ID type, name match |
| POST | `/login` | — | Legacy resident login (email/phone + password) |
| POST | `/servant/login` | — | Legacy servant login (email + password) |
| POST | `/unified-login` | — | Single login: auto-detects user vs servant. Returns OTP for citizens, JWT for servants/admin |
| POST | `/otp/request` | — | Request SMS OTP for phone-based login |
| POST | `/otp/verify` | — | Verify OTP and issue JWT |
| POST | `/verify-auth-otp` | — | Verify 6-digit auth OTP after login/registration |
| POST | `/resend-otp` | — | Resend auth OTP (supports `forceEmail` flag for SMS fallback) |
| POST | `/firebase/verify-phone` | — | Exchange Firebase Phone Auth token for local JWT |
| POST | `/verify-phone-otp` | — | Verify Firebase phone OTP during login/register flow |
| POST | `/forgot-password` | — | Request 6-digit password reset code via email/SMS |
| POST | `/reset-password` | — | Verify reset code and set new password |
| POST | `/reupload-id` | — | Reupload ID photo for `PENDING_REVIEW` / `REJECTED` users (multipart) |
| GET | `/profile` | JWT | Retrieve authenticated user's or servant's profile |
| PUT | `/profile` | JWT | Update profile fields + optional avatar upload (multipart) |

### Tickets (`/api/tickets`) — 10 endpoints

| Method | Endpoint | Auth | Role | Description |
|--------|----------|:----:|:----:|-------------|
| POST | `/` | JWT | CLIENT | Submit concern (multipart: text + up to 5 files, max 10MB each) |
| GET | `/` | JWT | CLIENT | List all tickets for authenticated citizen |
| GET | `/:id` | JWT | Any | Ticket detail with messages, attachments, feedback |
| POST | `/classify` | JWT | Any | AI-classify concern text → suggested department + confidence |
| GET | `/servant/assigned` | JWT | SERVANT | List tickets assigned to logged-in servant |
| PATCH | `/:id/status` | JWT | SERVANT | Update ticket status (PENDING → IN_PROGRESS → RESOLVED → CLOSED) |
| PATCH | `/:id/assign` | JWT | SERVANT | Assign/reassign ticket to a specific servant |
| POST | `/:id/message` | JWT | Any | Send message with optional file attachments (multipart, up to 5 files) |
| PATCH | `/:id/escalate` | JWT | SERVANT | Escalate ticket for higher-priority handling |
| POST | `/:id/feedback` | JWT | CLIENT | Submit satisfaction rating (1-5 stars) + optional comment |

### Admin (`/api/admin`) — 11 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/stats` | ADMIN | Dashboard: totals, breakdowns by status/priority/department, avg rating, SLA breaches, 7-day trend |
| GET | `/tickets` | ADMIN | Paginated tickets (filter: status, priority, departmentId; default 20/page) |
| GET | `/users` | ADMIN | All citizen accounts with ticket count, idPhotoUrl, idStatus |
| PUT | `/users/:id` | ADMIN | Edit citizen (name, email, phone, barangay, address, isVerified, password) |
| DELETE | `/users/:id` | ADMIN | Delete citizen (blocked if has open tickets) |
| PATCH | `/users/:id/archive` | ADMIN | Toggle citizen archive status |
| PATCH | `/users/:id/id-review` | ADMIN | Approve or reject citizen ID photo (`action: 'approve' \| 'reject'`) |
| GET | `/reports` | ADMIN | Analytics: KPIs, servant performance, daily trend (query: `range=1\|7\|15\|30\|90\|365\|all`) |
| GET | `/sla-breaches` | ADMIN | Open tickets past SLA deadline (ordered by oldest first) |
| DELETE | `/tickets/:id` | ADMIN | Permanently delete ticket + cascade |
| PATCH | `/tickets/:id/archive` | ADMIN | Archive (→CLOSED) or reactivate (→PENDING) ticket. Reactivation requires admin password |

### Servants (`/api/servants`) — 7 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/stats` | SERVANT | My stats: total, pending, in-progress, resolved, urgent, avg rating |
| PATCH | `/heartbeat` | SERVANT | Update `lastActiveAt` timestamp (called every ~120s by frontend) |
| PATCH | `/status` | SERVANT | Update availability (AVAILABLE / BUSY / OFFLINE) |
| GET | `/` | ADMIN | All servants with department, ticket count (sorted A-Z) |
| POST | `/` | ADMIN | Create servant (multipart: avatar optional) |
| PUT | `/:id` | ADMIN | Update servant (multipart: avatar optional, old avatar deleted on replace) |
| DELETE | `/:id` | ADMIN | Delete servant (open tickets re-queued: servantId cleared, status→PENDING) |

### Announcements (`/api/announcements`) — 6 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | — | List published announcements (optional category filter) |
| GET | `/:id` | — | Single announcement by ID |
| GET | `/all` | ADMIN | All announcements including drafts |
| POST | `/` | ADMIN | Create (title, content, category: INFO/ALERT/EVENT, isPublished). Broadcasts via Socket.IO if published |
| PUT | `/:id` | ADMIN | Update (partial). Broadcasts if newly published |
| DELETE | `/:id` | ADMIN | Delete announcement |

### Departments (`/api/departments`) — 4 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | — | List active departments with servant & ticket counts |
| GET | `/:id` | — | Single department with assigned servants |
| POST | `/` | ADMIN | Create department |
| PUT | `/:id` | ADMIN | Update department (partial) |

### Directory (`/api/directory`) — 5 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | — | List active directory entries (optional category filter) |
| GET | `/all` | ADMIN | All entries including inactive |
| POST | `/` | ADMIN | Create entry (name, position, department, phone, email, officeHours, category) |
| PUT | `/:id` | ADMIN | Update entry (partial) |
| DELETE | `/:id` | ADMIN | Delete entry |

### Notifications (`/api/notifications`) — 3 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/` | JWT | 50 most recent notifications for authenticated citizen |
| PATCH | `/:id/read` | JWT | Mark single notification as read |
| PATCH | `/read-all` | JWT | Mark all unread notifications as read |

**Total: 61 endpoints across 8 route files**

---

## SLA Policy

| Priority | Deadline | Use Case |
|----------|----------|----------|
| URGENT | 4 hours | Emergencies, public safety |
| NORMAL | 48 hours | Standard concerns |
| LOW | 5 days | Minor requests, inquiries |

---

## UI & Navigation

### Sidebar Layout (Authenticated)
- Collapsible left sidebar on desktop (expanded 256px / collapsed 72px)
- Mobile: hamburger-triggered slide-in drawer with swipe-to-close gesture
- Role-aware navigation links, notification bell with unread badge (citizens + servants only)
- Language selector, profile section with avatar and status indicator

### Admin Sidebar Links

| Link | Route | Description |
|------|-------|-------------|
| Admin Panel | `/admin` | Overview, Tickets, SLA Breaches (inline tabs) |
| Servants | `/admin?tab=servants` | Servant management |
| Citizens | `/admin?tab=citizens` | Citizen management + ID review |
| Departments | `/admin?tab=departments` | Department management |
| Announcements | `/announcements` | Announcement management |
| Directory | `/directory` | Barangay directory |
| Reports | `/reports` | Analytics |

---

## Project Structure

```
egov/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma              # 10 models, 10 enums (includes IdStatus)
│   │   ├── seed.js                    # Seed: admin, 11 servants, 10 citizens, 8 departments
│   │   └── migrations/               # Prisma migration history
│   │
│   ├── src/
│   │   ├── index.js                   # Express app bootstrap, route mounting, middleware
│   │   ├── controllers/
│   │   │   ├── authController.js      # Register, login, OTP, Firebase, password validation, ID status
│   │   │   └── ticketController.js    # Ticket CRUD, messaging, AI classification, file attachments
│   │   ├── routes/
│   │   │   ├── auth.js                # 16 endpoints — registration, login, OTP, password reset, ID reupload, profile
│   │   │   ├── tickets.js             # 10 endpoints — submit, list, chat, escalate, feedback
│   │   │   ├── admin.js               # 11 endpoints — stats, users, reports, SLA, archive, ID review
│   │   │   ├── servants.js            # 7 endpoints — stats, heartbeat, status, CRUD
│   │   │   ├── announcements.js       # 6 endpoints — public list, admin CRUD, Socket.IO broadcast
│   │   │   ├── departments.js         # 4 endpoints — public list, admin CRUD
│   │   │   ├── directory.js           # 5 endpoints — public list, admin CRUD
│   │   │   └── notifications.js       # 3 endpoints — list, mark read, mark all read
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verification + role guards
│   │   │   ├── upload.js              # Multer: avatarUpload, idUpload, upload (attachments)
│   │   │   └── errorHandler.js        # Global error handler
│   │   ├── services/
│   │   │   ├── classifier.js          # Claude Haiku 4.5 department classifier + keyword fallback
│   │   │   ├── idVerifier.js          # ID photo verification service
│   │   │   └── notification.js        # Email, in-app notification generation, servant socket notifications
│   │   └── lib/
│   │       ├── prisma.js              # Singleton Prisma Client (pool: 3 connections)
│   │       ├── socket.js              # Socket.IO init + event handlers
│   │       └── firebase.js            # Firebase Admin SDK for phone auth
│   │
│   ├── uploads/
│   │   ├── avatars/                   # User & servant profile photos
│   │   ├── ids/                       # Citizen ID verification photos
│   │   └── attachments/               # Ticket/message file attachments
│   │
│   ├── firebase-service-account.json  # Firebase credentials (not in git)
│   ├── .env.example                   # Environment template
│   ├── .env                           # Actual credentials (not in git)
│   └── package.json                   # 15 deps + 1 devDep (nodemon)
│
├── frontend/
│   ├── public/
│   │   ├── notification.mp3           # Two-tone notification sound
│   │   ├── .htaccess                  # Apache: SPA fallback
│   │   ├── site.webmanifest           # PWA manifest
│   │   └── favicon.svg                # App icon
│   │
│   ├── src/
│   │   ├── main.jsx                   # React entry point
│   │   ├── App.jsx                    # Root router — route guards, lazy loading, Suspense
│   │   ├── index.css                  # Global styles: Tailwind, touch targets, safe-area
│   │   │
│   │   ├── pages/                     # 12 page components
│   │   │   ├── LandingPage.jsx        # Public: hero, features, departments, CTA
│   │   │   ├── AuthPage.jsx           # Login, register (OCR ID verify + camera + password strength), forgot password, ID reupload
│   │   │   ├── ClientDashboard.jsx    # Citizen: ticket overview, quick submit
│   │   │   ├── SubmitConcern.jsx      # 2-step: text/voice/category → AI routing + file upload
│   │   │   ├── TrackTicket.jsx        # Ticket detail: status timeline, real-time chat, feedback
│   │   │   ├── ServantDashboard.jsx   # Servant: assigned tickets, actions, stats
│   │   │   ├── AdminDashboard.jsx     # Admin: inline tabs (overview/tickets/sla) + sidebar tabs (servants/citizens/departments)
│   │   │   ├── ReportsPage.jsx        # Analytics: period selector, KPIs, charts, CSV/PDF export
│   │   │   ├── AnnouncementsPage.jsx  # Public announcements with category filter
│   │   │   ├── DirectoryPage.jsx      # Official directory with category filter
│   │   │   ├── FaqPage.jsx            # FAQs (5 sections, accordion) + self-help directory
│   │   │   └── TermsPage.jsx          # Terms and conditions
│   │   │
│   │   ├── components/                # 5 reusable components
│   │   │   ├── SidebarLayout.jsx      # Collapsible sidebar (desktop) + mobile drawer with swipe-to-close
│   │   │   ├── Navbar.jsx             # Top navbar for public pages
│   │   │   ├── ProfileModal.jsx       # Profile editor modal (bottom-sheet on mobile)
│   │   │   ├── StatusBadge.jsx        # Ticket status/priority badges
│   │   │   └── ErrorBoundary.jsx      # React error boundary wrapper
│   │   │
│   │   ├── contexts/                  # 3 React Context providers
│   │   │   ├── AuthContext.jsx        # JWT storage, login/logout, user/servant state
│   │   │   ├── LanguageContext.jsx    # Trilingual i18n (English/Filipino/Cebuano)
│   │   │   └── SocketContext.jsx      # Socket.IO client tied to auth state
│   │   │
│   │   ├── lib/
│   │   │   └── firebase.js            # Firebase client SDK init
│   │   │
│   │   ├── api/
│   │   │   └── client.js              # Axios instance with JWT interceptor + base URL
│   │   │
│   │   └── i18n/
│   │       └── translations.js        # All UI strings (3 languages) + 15 barangay list
│   │
│   ├── index.html                     # HTML shell with PWA meta, loading spinner, error fallback
│   ├── vite.config.js                 # Vite config with React plugin
│   ├── tailwind.config.js             # Custom breakpoints (xs: 480px), primary/accent/gov colours
│   ├── postcss.config.js              # PostCSS: Tailwind + Autoprefixer
│   ├── .env                           # Firebase config (not in git)
│   └── package.json                   # 20 dependencies (includes tesseract.js)
│
├── sql/                               # Manual DB setup (for phpMyAdmin)
│   ├── 01-schema.sql                  # Full schema + indexes + department seed
│   ├── 02-seed-admin.sql              # 1 admin account
│   ├── 03-seed-servants.sql           # 11 servants across 8 departments
│   ├── 04-seed-citizens.sql           # 10 citizen accounts
│   ├── 05-add-message-attachments.sql # ALTER: attachments JSON column
│   ├── 06-seed-directory.sql          # 23 directory entries
│   ├── 07-add-user-id-photo.sql       # ALTER: idPhotoUrl column
│   └── 08-add-user-id-status.sql      # ALTER: idStatus enum column + backfill
│
├── .gitignore
├── .nvmrc                             # Node.js version: 18
└── README.md
```

### Database Models (Prisma — 10 models, 10 enums)

| Model | Key Fields | Relations |
|-------|-----------|-----------|
| **User** | email, phone, name, barangay, role (CLIENT/ADMIN), password, isVerified, idPhotoUrl, idStatus (VERIFIED/PENDING_REVIEW/REJECTED/NONE) | → tickets, notifications, announcements |
| **Servant** | email, name, position, departmentId, status (AVAILABLE/BUSY/OFFLINE), workload | → department, tickets, messages |
| **Department** | name, code, description, head, keywords (JSON), color, icon | → servants, tickets |
| **Ticket** | ticketNumber, userId, departmentId, servantId, title, description, category, status, priority, slaDeadline | → user, department, servant, messages, attachments, feedback, notifications |
| **Attachment** | ticketId, fileName, filePath, fileSize, mimeType | → ticket (cascade) |
| **TicketMessage** | ticketId, senderType (CLIENT/SERVANT/SYSTEM), message, attachments (JSON), isInternal | → ticket (cascade) |
| **Notification** | userId, ticketId, type, title, message, isRead | → user (cascade), ticket |
| **Feedback** | ticketId (unique), rating (1-5), comment | → ticket |
| **Announcement** | title, content, category (INFO/ALERT/EVENT), isPublished, createdById | → createdBy |
| **DirectoryEntry** | name, position, department, phone, email, category (OFFICIAL/EMERGENCY/SERVICE) | — |

---

## Performance & Resource Limits

Tuned for Hostinger Business shared hosting (40 entry process limit):

| Optimization | Value | Effect |
|---|---|---|
| HTTP `keepAliveTimeout` | 20 s | Idle connections released in 20 s (vs Node default ~5 min) |
| HTTP `requestTimeout` | 25 s | Hanging requests terminated, freeing process slots |
| Socket.IO `upgradeTimeout` | 5 s | Polling connections upgrade to WebSocket within 5 s |
| Socket.IO `pingInterval` | 60 s | Halved ping frequency vs default 25 s |
| Prisma connection pool | 3 | Reduced DB connections held open concurrently |
| Servant heartbeat | 120 s | ~5–6 req/min from all servants vs ~11 req/min |
| Admin servant poll | 120 s | 4× fewer HTTP hits when admin views Servants tab |
| Gzip compression | all responses | 60–80% payload reduction |
| Route code splitting | lazy-loaded pages | Small initial JS bundle |
| Batch DB queries | admin stats/reports | 2 queries for 365-day trend instead of 730 |
| Static asset caching | JS/CSS: 7 days | Browser cache eliminates repeat downloads |
| Client-side OCR | Tesseract.js | No server round-trip for ID verification |

---

## Security

- JWT authentication (7-day expiry)
- bcrypt password hashing (cost factor 10)
- Strong password policy enforced on registration, reset, and profile update (client + server)
- OTP verification for citizen accounts (SMS primary, email fallback)
- OCR-based ID verification with admin review workflow
- `PENDING_REVIEW` and `REJECTED` users blocked from login; reupload requires credential verification
- Email validation: format check, disposable domain blocking, MX record verification
- Registration deferred until OTP verified (no unverified accounts in DB)
- Rate limiting: 200 req/15 min global, 20 req/15 min auth
- Helmet.js security headers
- CORS with origin whitelist
- File upload validation (type + size limits, max 5 per message)
- Role-based access control (CLIENT / SERVANT / ADMIN)

---

## Mobile

- Collapsible desktop sidebar; slide-in drawer with swipe-to-close on mobile
- 44px touch targets, 16px inputs (iOS auto-zoom prevention), safe-area insets
- Camera capture with rear-facing preference and iOS fallback
- PWA installable from browser (Android + iOS)
- Reduced motion support (`prefers-reduced-motion`)

---

*Municipality of Aloguinsan, Province of Cebu, Philippines*
