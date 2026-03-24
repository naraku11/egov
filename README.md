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
| Database | MySQL 8 · Prisma ORM 6.19 (10 models) |
| AI — Classification | Claude Haiku 4.5 (`claude-haiku-4-5`) — department routing via tool-use |
| AI — ID Verification | Claude Haiku 4.5 Vision (`claude-haiku-4-5-20251001`) — ID photo analysis |
| Auth | JWT (jsonwebtoken) · bcryptjs · OTP (email + Firebase Phone Auth) |
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
| Admin | admin@aloguinsan.gov.ph | admin123 |
| Resident | juan.delacruz@example.com | resident123 |
| Servant | maria.santos@aloguinsan.gov.ph | servant123 |

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

# AI (Anthropic Claude — powers ticket classification + ID verification)
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
- **AI-powered ID verification** — upload or camera-capture a government-issued ID; Claude Vision validates authenticity, type, name match, and confidence score
- **Camera capture** — use device camera (rear-facing preferred) to photograph ID directly from the registration form
- Login OTP: **SMS first** (Firebase) if phone provided, **email fallback** if SMS unavailable
- Auto-fallback to email if Firebase SMS fails (rate limit, billing, etc.)
- Login with phone number via **Firebase Phone Auth** (SMS OTP)
- Submit concerns via text, voice-to-text, or category selection with file attachments
- AI classifier routes concerns to the correct department automatically
- Real-time ticket tracking with status timeline
- Chat with assigned servant with **file attachments** (images, PDFs, docs, videos — up to 5 per message)
- Star ratings and comments on resolved tickets
- Browse announcements and barangay directory
- Edit profile with avatar photo upload
- **FAQs & Self-Help** section with department contact directory
- **Terms and Conditions** agreement during registration

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

## UI & Navigation

### Sidebar Layout (Authenticated)
- Collapsible left sidebar on desktop (expanded 256px / collapsed 72px)
- Mobile: hamburger-triggered slide-in drawer with swipe-to-close gesture
- Role-aware navigation links, notification bell with unread badge
- Language selector, profile section with avatar and status indicator
- Quick access: Submit Concern button on citizen dashboard

### Notification System
- Real-time in-app notifications via Socket.IO
- **Sound alerts** on new notifications (two-tone ding)
- **Announcement popups** — toast notification when admin publishes new announcement
- Notification dropdown in sidebar (desktop) and header bar (mobile)

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

**ID Verification:** Citizens must upload or capture a valid government-issued ID during registration. The image is verified by Claude Vision AI (Haiku 4.5) which checks: legitimacy, ID type, name match, and confidence score. Accepted IDs include National ID, PhilSys, Driver's License, Passport, Voter's ID, SSS, GSIS, PhilHealth, Postal ID, Barangay Certificate, Senior Citizen, PWD, and others.

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

## Barangays

Angilan, Bojo, Bonbon, Esperanza, Kandingan, Kantabogon, Kawasan, Olango, Poblacion, Punay, Rosario, Saksak, Tampaan, Tuyokon, Zaragosa

---

## API Endpoints

> All endpoints are prefixed with `/api`. JWT = Bearer token required. Role = additional role check.

### Auth (`/api/auth`) — 15 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/register` | — | Register with ID photo (multipart). Returns OTP — account not created until verified |
| POST | `/verify-id` | — | AI-verify uploaded ID photo (multipart: image + name). Returns validity, ID type, name match, confidence |
| POST | `/login` | — | Legacy resident login (email/phone + password) |
| POST | `/servant/login` | — | Legacy servant login (email + password) |
| POST | `/unified-login` | — | Single login: auto-detects user vs servant. Returns OTP for citizens, JWT for servants/admin |
| POST | `/otp/request` | — | Request SMS OTP for phone-based login |
| POST | `/otp/verify` | — | Verify OTP and issue JWT (creates guest account if needed) |
| POST | `/verify-auth-otp` | — | Verify 6-digit auth OTP after login/registration (creates account on first verify) |
| POST | `/resend-otp` | — | Resend auth OTP (supports `forceEmail` flag for SMS fallback) |
| POST | `/firebase/verify-phone` | — | Exchange Firebase Phone Auth token for local JWT (passwordless login) |
| POST | `/verify-phone-otp` | — | Verify Firebase phone OTP during login/register flow |
| POST | `/forgot-password` | — | Request 6-digit password reset code via email/SMS |
| POST | `/reset-password` | — | Verify reset code and set new password |
| GET | `/profile` | JWT | Retrieve authenticated user's or servant's profile (password omitted) |
| PUT | `/profile` | JWT | Update profile fields + optional avatar upload (multipart) |

### Tickets (`/api/tickets`) — 9 endpoints

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

### Admin (`/api/admin`) — 10 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/stats` | ADMIN | Dashboard: totals, breakdowns by status/priority/department, avg rating, SLA breaches, 7-day trend |
| GET | `/tickets` | ADMIN | Paginated tickets (filter: status, priority, departmentId; default 20/page) |
| GET | `/users` | ADMIN | All citizen accounts (CLIENT role) with ticket count |
| PUT | `/users/:id` | ADMIN | Edit citizen (name, email, phone, barangay, address, isVerified, password) |
| DELETE | `/users/:id` | ADMIN | Delete citizen (blocked if has open tickets) |
| PATCH | `/users/:id/archive` | ADMIN | Toggle citizen archive status (enables/disables login) |
| GET | `/reports` | ADMIN | Analytics: KPIs, servant performance, daily trend (query: `range=1\|7\|15\|30\|90\|365\|all`) |
| GET | `/sla-breaches` | ADMIN | Open tickets past SLA deadline (ordered by oldest first) |
| DELETE | `/tickets/:id` | ADMIN | Permanently delete ticket + cascade (messages, attachments, notifications, feedback) |
| PATCH | `/tickets/:id/archive` | ADMIN | Archive (→CLOSED) or reactivate (→PENDING) ticket. Reactivation requires admin password |

### Servants (`/api/servants`) — 7 endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/stats` | SERVANT | My stats: total, pending, in-progress, resolved, urgent, avg rating |
| PATCH | `/heartbeat` | SERVANT | Update `lastActiveAt` timestamp (called every ~60s by frontend) |
| PATCH | `/status` | SERVANT | Update availability (AVAILABLE / BUSY / OFFLINE) |
| GET | `/` | ADMIN | All servants with department, ticket count (sorted A-Z) |
| POST | `/` | ADMIN | Create servant (multipart: avatar optional; default password "servant123") |
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

**Total: 59 endpoints across 8 route files**

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
│   │   ├── schema.prisma              # 10 models: User, Servant, Department, Ticket,
│   │   │                              #   Attachment, TicketMessage, Notification,
│   │   │                              #   Feedback, Announcement, DirectoryEntry
│   │   ├── seed.js                    # Seed: admin, 11 servants, 10 citizens, 8 departments
│   │   └── migrations/               # Prisma migration history
│   │
│   ├── src/
│   │   ├── index.js                   # Express app bootstrap, route mounting, middleware
│   │   ├── controllers/
│   │   │   ├── authController.js      # Register, login, OTP, Firebase, email validation, ID upload
│   │   │   └── ticketController.js    # Ticket CRUD, messaging, AI classification, file attachments
│   │   ├── routes/
│   │   │   ├── auth.js                # 15 endpoints — registration, login, OTP, password reset, profile
│   │   │   ├── tickets.js             # 9 endpoints — submit, list, chat, escalate, feedback
│   │   │   ├── admin.js               # 10 endpoints — stats, users, reports, SLA, archive
│   │   │   ├── servants.js            # 7 endpoints — stats, heartbeat, status, CRUD
│   │   │   ├── announcements.js       # 6 endpoints — public list, admin CRUD, Socket.IO broadcast
│   │   │   ├── departments.js         # 4 endpoints — public list, admin CRUD
│   │   │   ├── directory.js           # 5 endpoints — public list, admin CRUD
│   │   │   └── notifications.js       # 3 endpoints — list, mark read, mark all read
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verification + role guards (authenticate, requireAdmin, etc.)
│   │   │   ├── upload.js              # Multer: avatarUpload, idUpload, upload (attachments)
│   │   │   └── errorHandler.js        # Global error handler
│   │   ├── services/
│   │   │   ├── classifier.js          # Claude Haiku 4.5 department classifier + keyword fallback
│   │   │   ├── idVerifier.js          # Claude Vision 4.5 ID photo verification (tool-use)
│   │   │   └── notification.js        # Email, SMS, in-app notification generation
│   │   └── lib/
│   │       ├── prisma.js              # Singleton Prisma Client
│   │       ├── socket.js              # Socket.IO init + event handlers
│   │       └── firebase.js            # Firebase Admin SDK for phone auth
│   │
│   ├── uploads/
│   │   ├── avatars/                   # User & servant profile photos
│   │   ├── ids/                       # Citizen ID verification photos
│   │   └── attachments/               # Ticket/message file attachments
│   │
│   ├── firebase-service-account.json  # Firebase credentials (not in git)
│   ├── .env.example                   # Environment template with all variables
│   ├── .env                           # Actual credentials (not in git)
│   └── package.json                   # 15 deps + 1 devDep (nodemon)
│
├── frontend/
│   ├── public/
│   │   ├── notification.mp3           # Two-tone notification sound
│   │   ├── .htaccess                  # Apache: SPA fallback + .builds blocking
│   │   ├── site.webmanifest           # PWA manifest
│   │   ├── favicon.svg                # App icon
│   │   └── web-app-manifest-*.png     # PWA icons
│   │
│   ├── src/
│   │   ├── main.jsx                   # React entry point
│   │   ├── App.jsx                    # Root router — route guards, lazy loading, Suspense
│   │   ├── index.css                  # Global styles: Tailwind, touch targets, safe-area, animations
│   │   │
│   │   ├── pages/                     # 12 page components
│   │   │   ├── LandingPage.jsx        # Public: hero, features, departments, CTA
│   │   │   ├── AuthPage.jsx           # Login, register (ID verify + camera capture), forgot password
│   │   │   ├── ClientDashboard.jsx    # Citizen: ticket overview, quick submit
│   │   │   ├── SubmitConcern.jsx      # 2-step: text/voice/category → AI routing + file upload
│   │   │   ├── TrackTicket.jsx        # Ticket detail: status timeline, real-time chat, feedback
│   │   │   ├── ServantDashboard.jsx   # Servant: assigned tickets, actions, stats
│   │   │   ├── AdminDashboard.jsx     # Admin: 7-tab panel (overview/tickets/servants/citizens/SLA/announcements/directory)
│   │   │   ├── ReportsPage.jsx        # Analytics: period selector, KPIs, charts, CSV/PDF export
│   │   │   ├── AnnouncementsPage.jsx  # Public announcements with category filter
│   │   │   ├── DirectoryPage.jsx      # Official directory with category filter
│   │   │   ├── FaqPage.jsx            # FAQs (5 sections, accordion) + self-help directory (6 departments)
│   │   │   └── TermsPage.jsx          # Terms and conditions (11 sections)
│   │   │
│   │   ├── components/                # 5 reusable components
│   │   │   ├── SidebarLayout.jsx      # Collapsible sidebar (desktop) + mobile drawer with swipe-to-close
│   │   │   ├── Navbar.jsx             # Top navbar for public/unauthenticated pages
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
│   │   │   └── firebase.js            # Firebase client SDK init (RecaptchaVerifier, signInWithPhoneNumber)
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
│   └── package.json                   # 19 dependencies
│
├── sql/                               # Manual DB setup (for phpMyAdmin)
│   ├── 01-schema.sql                  # Full schema + indexes + department seed
│   ├── 02-seed-admin.sql              # 1 admin account
│   ├── 03-seed-servants.sql           # 11 servants across 8 departments
│   ├── 04-seed-citizens.sql           # 10 citizen accounts
│   ├── 05-add-message-attachments.sql # ALTER: attachments JSON column
│   ├── 06-seed-directory.sql          # 23 directory entries
│   └── 07-add-user-id-photo.sql       # ALTER: idPhotoUrl column
│
├── .gitignore                         # node_modules, .env, uploads/*, .claude/, dist/
├── .nvmrc                             # Node.js version: 18
└── README.md
```

### Database Models (Prisma — 10 models)

| Model | Key Fields | Relations |
|-------|-----------|-----------|
| **User** | email, phone, name, barangay, role (CLIENT/ADMIN), password, isVerified, idPhotoUrl | → tickets, notifications |
| **Servant** | email, name, position, departmentId, status (AVAILABLE/BUSY/OFFLINE), workload | → department, tickets, messages |
| **Department** | name, code, description, head, keywords (JSON), color, icon | → servants, tickets |
| **Ticket** | ticketNumber, userId, departmentId, servantId, title, description, category, status, priority, slaDeadline | → user, department, servant, messages, attachments, feedback |
| **Attachment** | ticketId, fileName, filePath, fileSize, mimeType | → ticket (cascade) |
| **TicketMessage** | ticketId, senderType (CLIENT/SERVANT/SYSTEM), message, attachments (JSON), isInternal | → ticket (cascade) |
| **Notification** | userId, ticketId, type, title, message, isRead | → user (cascade), ticket |
| **Feedback** | ticketId (unique), rating (1-5), comment | → ticket |
| **Announcement** | title, content, category (INFO/ALERT/EVENT), isPublished, createdById | → createdBy |
| **DirectoryEntry** | name, position, department, phone, email, category (OFFICIAL/EMERGENCY/SERVICE) | — |

---

## Performance

- **Gzip compression** on all HTTP responses via `compression` middleware (60-80% size reduction)
- **Route-level code splitting** — heavy pages (AdminDashboard, ReportsPage, etc.) lazy-loaded with `React.lazy()` + `Suspense`, keeping the initial JS bundle small
- **Batch DB queries** — admin stats and reports endpoints use bulk fetches + in-memory grouping instead of N+1 sequential queries (e.g. 365-day trend: 2 queries instead of 730)
- **Parallelised queries** — independent database calls run concurrently via `Promise.all()`
- **Static asset caching** — hashed JS/CSS cached 7 days; uploaded files cached 7 days with etag
- **Lean auth middleware** — password hash excluded from `req.user`; fetched on-demand only when needed
- **Reduced motion** — respects `prefers-reduced-motion` to disable animations on low-power devices
- **GPU-friendly** — blur effects hidden on mobile to prevent GPU-heavy rendering on low-end phones

---

## Security

- JWT authentication (7-day expiry)
- bcrypt password hashing (cost factor 10)
- Password hash never stored on request context (fetched on-demand for profile updates only)
- OTP verification for citizen accounts (SMS primary, email fallback)
- AI-powered ID verification during registration (Claude Vision)
- Email validation: format check, disposable domain blocking, MX record verification
- Registration deferred until OTP verified (no unverified accounts in DB)
- Rate limiting (200 req/15 min global, 20 req/15 min auth)
- Helmet.js security headers
- CORS with origin whitelist
- Gzip response compression
- File upload validation (type + size limits, max 5 per message)
- Role-based access control (CLIENT / SERVANT / ADMIN)
- Terms and Conditions agreement required during registration

---

## Mobile Optimization

- **Responsive sidebar layout** — collapsible desktop sidebar; slide-in drawer with swipe-to-close on mobile
- **Body scroll lock** — background content locked when mobile drawer or modal is open
- **44px touch targets** — all interactive elements meet minimum recommended touch size
- **iOS auto-zoom prevention** — 16px font on all input fields
- **Safe-area insets** — fixed headers, footers, and drawers respect iPhone notch / Dynamic Island
- **Camera capture** — `getUserMedia` with rear-camera preference and iOS fallback
- **Stream cleanup** — camera streams stopped on component unmount (prevents battery drain)
- **Dynamic viewport height** — `dvh` units adapt to mobile keyboard presence
- **Notification dropdown** — repositioned for mobile header bar (right-aligned, viewport-constrained)
- **Bottom-sheet modals** — ProfileModal slides up from bottom on mobile for native UX
- **Horizontal scroll navigation** — FAQ section tabs scroll horizontally on mobile instead of stacking vertically
- **Reduced motion** — animations disabled for users with `prefers-reduced-motion` preference
- **PWA installable** from browser (Android + iOS)
- **Split-panel auth page** — branding panel on desktop, compact form on mobile

---

*Municipality of Aloguinsan, Province of Cebu, Philippines*
