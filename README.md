# E-Government Assistance System
### Municipality of Aluguinsan, Cebu

AI-powered citizen concern management system that matches residents with the appropriate public servants — fast, transparent, and multilingual.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                  │
│  React.js + Vite + Tailwind CSS (Web / PWA)         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 API / BACKEND LAYER                   │
│  Node.js + Express  ─── Python Flask (AI Classifier) │
│  JWT Auth · Rate Limiting · File Upload (Multer)     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   DATA LAYER                          │
│  PostgreSQL (Primary DB via Prisma ORM)              │
│  Redis (Session cache, real-time status)             │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option A: Docker Compose (Recommended)

```bash
# 1. Enter the project directory
cd egov_v1

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials and secrets

# 3. Start all services
docker-compose up -d

# Services:
#   Web:     http://localhost:3000
#   API:     http://localhost:5000
#   AI:      http://localhost:5001
```

### Option B: Manual Development Setup

**Prerequisites:** Node.js 20+, PostgreSQL 16, Redis 7, Python 3.11+

```bash
# --- Backend ---
cd backend
cp .env.example .env
# Set DATABASE_URL in .env (postgresql://user:pass@localhost:5432/egov_aluguinsan)

npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev
# API runs on http://localhost:5000

# --- AI Classifier ---
cd ../ai-classifier
pip install -r requirements.txt
python app.py
# Runs on http://localhost:5001

# --- Frontend ---
cd ../frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aluguinsan.gov.ph | admin123 |
| Resident | juan.delacruz@example.com | resident123 |
| Servant | maria.santos@aluguinsan.gov.ph | servant123 |

> Servant accounts log in using the **"Login as Public Servant"** toggle on the login page.

---

## Key Features

### Resident (Client) Flow
- Landing page with language selector (English / Filipino / Cebuano)
- Register and login with email + password
- Submit concerns via text, voice-to-text, or category selection with file attachments
- AI classifier automatically routes concerns to the correct department
- Real-time ticket tracking with status timeline
- **Chat with assigned servant** — WhatsApp-style message bubbles, auto-scroll, live polling every 8 s
- Leave star ratings and comments on resolved tickets
- **Announcements** — browse published barangay announcements with category filters (Info / Alert / Event)
- **Barangay Directory** — look up officials, emergency services, and government offices
- **Edit profile** — update name, phone, address, language preference, and profile photo from the Navbar

### Public Servant Flow
- Dashboard showing assigned tickets with priority indicators and SLA deadlines
- Reply to residents directly inside ticket chat
- **Internal notes** — visible only to servants, shown in amber; auto-scroll and live polling
- Escalate tickets with reason, mark in-progress / resolved
- Update own availability status (Available / Busy / Offline) — reflected live in the Navbar
- **Edit profile** — name, position, phone, password, and avatar photo

### Admin Flow
- **Admin Panel** with six tabs: Overview · Tickets · Servants · SLA Breaches · Announcements · Directory
- **Overview** — system stats, 7-day trend chart, status distribution, department breakdown, recent submissions feed, quick-action buttons
- **Tickets** — searchable and filterable table by title, ticket number, resident name, and status
- **Servants** — card grid with workload bar, availability badge, edit / remove actions
- **SLA Breaches** — red-flagged overdue tickets with deadline and time-since info
- **Announcements** — create / edit / delete announcements with Info / Alert / Event categories; toggle Draft vs Published
- **Directory** — manage barangay officials, emergency services, and gov't offices; toggle Active / Hidden per entry
- Add, edit, and remove public servants with department assignment and temporary password

---

## Mobile Installation (PWA)

The app is a Progressive Web App — install it directly from the browser, no app store required.

### Step 1 — Generate icons (one-time, before building)

```bash
cd frontend

# Option A: Use sharp to auto-generate icons from SVG
npm install sharp --save-dev
node scripts/create-icons.js

# Option B: Manual
# 1. Go to https://realfavicongenerator.net
# 2. Upload frontend/public/icons/icon.svg
# 3. Download the package
# 4. Place icon-192.png and icon-512.png in frontend/public/icons/
```

### Step 2 — Build for production

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

### Step 3 — Serve with HTTPS (required for PWA install prompt)

```bash
# Test locally
npm run preview
# Opens at http://localhost:4173

# On mobile (same WiFi network):
# Find your PC's IP: run `ipconfig` (Windows) → look for IPv4 Address
# Open http://192.168.x.x:4173 in Chrome on your phone
```

> PWA install prompts require HTTPS in production. Use Nginx + Let's Encrypt, or Cloudflare Tunnel for quick testing.

### Step 4 — Install on Android
1. Open Chrome → navigate to your site URL
2. Tap the **⋮** menu → **"Add to Home Screen"**
3. Tap **Install** — the app icon appears on the home screen

### Step 5 — Install on iPhone / iPad
1. Open Safari → navigate to your site URL
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"** → **Add**

---

## Project Structure

```
egov_v1/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
│
├── backend/                    # Node.js + Express API
│   ├── prisma/
│   │   ├── schema.prisma       # Database models
│   │   └── seed.js             # Demo data (departments, servants, users)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js      # Login, register, profile update + avatar upload
│   │   │   └── ticketController.js    # Tickets, messages, feedback, escalation
│   │   ├── routes/
│   │   │   ├── auth.js                # /api/auth
│   │   │   ├── tickets.js             # /api/tickets
│   │   │   ├── servants.js            # /api/servants
│   │   │   ├── departments.js         # /api/departments
│   │   │   ├── admin.js               # /api/admin
│   │   │   ├── notifications.js       # /api/notifications
│   │   │   ├── announcements.js       # /api/announcements
│   │   │   └── directory.js           # /api/directory
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verify, requireClient/Servant/Admin guards
│   │   │   ├── upload.js              # Multer — ticket attachments + avatar upload
│   │   │   └── errorHandler.js        # Global error middleware
│   │   └── services/
│   │       ├── classifier.js          # AI classifier HTTP client + local fallback
│   │       └── notification.js        # Create in-app notifications
│   └── Dockerfile
│
├── ai-classifier/              # Python Flask NLP service
│   ├── classifier.py           # Multi-lingual keyword classifier
│   ├── app.py                  # REST API
│   └── Dockerfile
│
└── frontend/                   # React 18 + Vite + Tailwind CSS
    ├── public/
    │   └── icons/              # PWA icons (icon-192.png, icon-512.png)
    ├── scripts/
    │   └── create-icons.js     # PWA icon generator (uses sharp)
    └── src/
        ├── pages/
        │   ├── LandingPage.jsx         # Hero + department map
        │   ├── AuthPage.jsx            # Login / Register (+ servant toggle)
        │   ├── ClientDashboard.jsx     # Resident home — stats, recent tickets, quick actions
        │   ├── SubmitConcern.jsx       # 3-step concern form with file attachments
        │   ├── TrackTicket.jsx         # Ticket list + chat detail (WhatsApp-style)
        │   ├── ServantDashboard.jsx    # Assigned tickets + chat + internal notes
        │   ├── AdminDashboard.jsx      # Admin panel — 6 tabs including Announcements & Directory
        │   ├── AnnouncementsPage.jsx   # Public announcements feed (residents & servants)
        │   └── DirectoryPage.jsx       # Barangay directory by category (residents & servants)
        ├── components/
        │   ├── Navbar.jsx              # Role-aware nav with profile dropdown + Edit Profile
        │   ├── ProfileModal.jsx        # Edit profile: name, photo, phone, password
        │   └── StatusBadge.jsx         # Status / priority pills
        ├── contexts/
        │   ├── AuthContext.jsx         # JWT auth state + updateUser / updateServant helpers
        │   └── LanguageContext.jsx     # i18n context
        ├── i18n/
        │   └── translations.js         # EN / Filipino / Cebuano strings
        └── api/
            └── client.js               # Axios instance with JWT interceptor
```

---

## Department Routing

| Department | Code | Meaning / Handles | Example Keywords |
|------------|------|-------------------|-----------------|
| Mayor's Office | MAYORS | The executive office of the local government. Handles general governance, official certifications, requests for the Mayor's endorsement, barangay clearances, and concerns that do not fall under a specific department. | mayor, document, clearance, certification |
| Municipal Engineering Office | ENGINEERING | Responsible for the design, construction, and maintenance of public infrastructure. Handles complaints about roads, bridges, drainage systems, potholes, floods, and public works projects. | road, flood, bridge, drainage, pothole |
| MSWDO | MSWDO | **Municipal Social Welfare and Development Office.** Provides social protection services to vulnerable sectors — Persons with Disabilities (PWD), senior citizens, solo parents, 4Ps (Pantawid Pamilyang Pilipino Program) beneficiaries, women, and children in need. | pwd, senior, 4ps, social welfare, child |
| Rural Health Unit | RHU | The primary public health facility of the municipality. Handles concerns about medical consultations, medicines, vaccinations, disease outbreaks (dengue, COVID, etc.), maternal care, and referrals to hospitals. | health, medicine, vaccine, doctor, dengue |
| MPDO | MPDO | **Municipal Planning and Development Office.** Oversees land use planning, zoning, business permits, building permits, and development projects within the municipality. | business permit, zoning, land use |
| MENRO | MENRO | **Municipal Environment and Natural Resources Office.** Enforces environmental laws and handles concerns about illegal logging, garbage collection, pollution, waste management, and protection of natural resources. | environment, logging, garbage, pollution |
| PNP | PNP | **Philippine National Police** — Aluguinsan Station. Handles peace and order concerns including crimes, theft, drugs, illegal activities, traffic enforcement, and public safety incidents. | police, crime, theft, drugs, safety |
| Treasurer's Office | TREASURER | Manages the collection of local taxes, fees, and charges. Handles real property tax payments, business tax, community tax certificates (cedula), tax clearances, and other financial transactions with the LGU. | tax, payment, clearance, cedula |

The AI classifier scores each department using multilingual keyword sets (EN / Filipino / Cebuano) and routes the ticket accordingly. If the Flask service is unavailable, the backend falls back to its own local keyword scorer.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new resident |
| POST | `/api/auth/login` | Resident / admin login |
| POST | `/api/auth/servant/login` | Public servant login |
| GET | `/api/auth/profile` | Get current user profile |
| PUT | `/api/auth/profile` | Update profile — name, phone, address, language, position, password, avatar (`multipart/form-data`) |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tickets` | Submit concern (`multipart/form-data`, up to 5 attachments) |
| GET | `/api/tickets` | Get my tickets (resident, paginated) |
| GET | `/api/tickets/:id` | Ticket detail + messages (servants see internal notes) |
| POST | `/api/tickets/classify` | AI classify text → department |
| GET | `/api/tickets/servant/assigned` | Servant's assigned tickets |
| PATCH | `/api/tickets/:id/status` | Update ticket status (servant) |
| POST | `/api/tickets/:id/message` | Add message or internal note (servant only for internal) |
| PATCH | `/api/tickets/:id/assign` | Servant self-assigns a ticket |
| PATCH | `/api/tickets/:id/escalate` | Escalate with reason |
| POST | `/api/tickets/:id/feedback` | Submit star rating + comment (resident) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Overview stats + chart data |
| GET | `/api/admin/tickets` | All tickets (paginated, filterable) |
| GET | `/api/admin/sla-breaches` | Tickets past SLA deadline |

### Servants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servants` | List all servants (admin) |
| POST | `/api/servants` | Create new servant (admin) |
| PUT | `/api/servants/:id` | Update servant details (admin) |
| DELETE | `/api/servants/:id` | Remove servant, returns tickets to Pending (admin) |
| GET | `/api/servants/stats` | Servant's own performance stats |
| PATCH | `/api/servants/status` | Update own availability status |

### Announcements
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/announcements` | Published announcements (public, optional `?category=`) |
| GET | `/api/announcements/all` | All announcements including drafts (admin only) |
| GET | `/api/announcements/:id` | Single announcement (public) |
| POST | `/api/announcements` | Create announcement (admin) |
| PUT | `/api/announcements/:id` | Update announcement (admin) |
| DELETE | `/api/announcements/:id` | Delete announcement (admin) |

### Directory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/directory` | Active directory entries (public, optional `?category=`) |
| GET | `/api/directory/all` | All entries including hidden (admin only) |
| POST | `/api/directory` | Add directory entry (admin) |
| PUT | `/api/directory/:id` | Update entry (admin) |
| DELETE | `/api/directory/:id` | Remove entry (admin) |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get my notifications (resident) |
| PATCH | `/api/notifications/:id/read` | Mark notification as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |

---

## SLA Policy

**SLA** stands for **Service Level Agreement** — a formal commitment that defines the maximum time within which a government office must respond to or resolve a citizen's concern. It sets clear accountability standards so that residents know when to expect action, and administrators can track which tickets are overdue.

In this system, the SLA clock starts the moment a ticket is submitted. Each ticket is assigned a priority level, and the corresponding deadline is calculated automatically:

| Priority | Response Deadline | When to Use |
|----------|-------------------|-------------|
| URGENT | 4 hours | Life-threatening situations, public safety emergencies, active disasters |
| NORMAL | 48 hours (2 days) | Standard citizen concerns requiring timely but non-emergency attention |
| LOW | 120 hours (5 days) | Minor requests, informational inquiries, non-time-sensitive reports |

Tickets past their SLA deadline are flagged red in the **Admin Panel → SLA Breaches** tab. The tab badge shows the live count of overdue tickets so administrators can immediately identify and act on bottlenecks.

---

## Chat & Messaging

Messages are scoped to tickets and stored in the `TicketMessage` table with three sender types:

| Sender Type | Visible To | Style |
|-------------|------------|-------|
| `CLIENT` | Everyone | Primary-blue bubble (right) |
| `SERVANT` | Everyone | Indigo bubble (right in servant view, left in client view) |
| `SYSTEM` | Everyone | Centered italic pill (gray) |
| Internal Note (`isInternal: true`) | Servants only | Amber card with 🔒 badge |

Both the resident (TrackTicket) and servant (ServantDashboard) views auto-scroll to the latest message and poll for new messages every 8 seconds.

---

## Security

- JWT authentication with 7-day expiry
- bcrypt password hashing (cost factor 10)
- Rate limiting (200 req / 15 min global; 20 req / 15 min for auth routes)
- Helmet.js security headers
- CORS with origin whitelist
- File upload validation (type + size, max 10 MB for tickets; 2 MB for avatars)
- Role-based access control (CLIENT · SERVANT · ADMIN)
- Compliant with **RA 10173 (Data Privacy Act of the Philippines)**

---

## Multi-Language Support

All UI strings and AI keyword sets support three languages:

| Code | Language | Notes |
|------|----------|-------|
| `en` | English | Default |
| `fil` | Filipino | Tagalog-based national language |
| `ceb` | Cebuano | Regional language of Cebu |

---

## Roadmap

- [ ] React Native mobile app (Android + iOS) with biometrics
- [ ] Firebase push notifications
- [ ] Twilio SMS for status updates
- [ ] HuggingFace NLP model (replace keyword classifier)
- [ ] Appointment scheduling system
- [ ] Barangay-level reports and exports
- [ ] E-signature for official documents
- [x] PWA — installable on Android and iOS via browser
- [x] Profile editing with avatar photo upload
- [x] Barangay announcements (admin publish, public view)
- [x] Barangay directory (officials, emergency, gov't services)
- [x] WhatsApp-style in-ticket chat with auto-scroll and live polling
- [x] Servant internal notes (visible only to servants)
- [x] Admin panel — Announcements & Directory management tabs

---

*Developed for the Municipality of Aluguinsan, Province of Cebu, Philippines*
*Compliant with DICT digitization standards and RA 10173*
