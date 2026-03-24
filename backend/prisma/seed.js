/**
 * @file seed.js
 *
 * Database seed script for the eGov municipal service desk application of
 * Aloguinsan, Cebu.
 *
 * Running this script (`npx prisma db seed` or `node seed.js`) populates the
 * database with the initial reference data required for the application to
 * function out of the box:
 *
 *   1. Municipal departments — the eight offices that receive and handle
 *      resident tickets, including their AI-routing keyword lists.
 *   2. Government servants — one or two staff accounts per department so
 *      ticket assignment is possible immediately after setup.
 *   3. System administrator account — for managing the platform.
 *   4. Sample resident account — for demonstration and testing purposes.
 *
 * All upserts are idempotent: running the script multiple times will not
 * create duplicate records.
 *
 * Default credentials (CHANGE IN PRODUCTION):
 *   Admin    — admin@aloguinsan.gov.ph  / admin123
 *   Resident — juan.delacruz@example.com / resident123
 *   Servants — <first>.<last>@aloguinsan.gov.ph / servant123
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// =============================================================================
// Department seed data
//
// Each entry defines one municipal office.  The `code` field is used as the
// stable upsert key so the record can be safely re-seeded without duplication.
// The `keywords` array is consumed by the AI ticket-routing classifier to
// match a resident's free-text description to the most relevant department.
// =============================================================================
const departments = [
  {
    // Handles general inquiries, official document requests, barangay
    // coordination, and endorsements that do not belong to a specific office.
    name: "Mayor's Office",
    code: 'MAYORS',
    description: 'General inquiries, official documents, and barangay coordination',
    head: 'Hon. Mayor',
    email: 'mayor@aloguinsan.gov.ph',
    phone: '032-000-0001',
    color: '#1D4ED8',  // Deep blue — primary office of the municipality
    icon: 'star',
    keywords: ['mayor', 'general inquiry', 'document', 'certificate', 'barangay', 'coordination', 'permit', 'endorsement', 'clearance'],
  },
  {
    // Handles physical infrastructure concerns: road damage, flooding,
    // drainage, bridge repairs, and construction-related requests.
    name: 'Municipal Engineering Office',
    code: 'ENGINEERING',
    description: 'Road damage, flood control, and infrastructure requests',
    head: 'Municipal Engineer',
    email: 'engineering@aloguinsan.gov.ph',
    phone: '032-000-0002',
    color: '#D97706',  // Amber — associated with construction / heavy equipment
    icon: 'wrench',
    keywords: ['road', 'flood', 'infrastructure', 'bridge', 'drainage', 'pothole', 'construction', 'repair', 'building', 'structure', 'engineering'],
  },
  {
    // Municipal Social Welfare and Development Office — assists vulnerable
    // sectors including PWDs, senior citizens, indigents, solo parents,
    // children in need, and 4Ps beneficiaries.
    name: 'MSWDO',
    code: 'MSWDO',
    description: 'Social welfare, PWD assistance, and senior citizen benefits',
    head: 'MSWDO Head',
    email: 'mswdo@aloguinsan.gov.ph',
    phone: '032-000-0003',
    color: '#059669',  // Emerald green — associated with care and community
    icon: 'heart',
    keywords: ['social', 'welfare', 'pwd', 'disability', 'senior', 'citizen', 'elderly', 'indigent', 'solo parent', 'child', 'family', 'assistance', 'benefit', '4ps'],
  },
  {
    // Rural Health Unit — handles public health programmes, medical
    // certificates, immunisation schedules, sanitation concerns, and
    // disease-prevention campaigns.
    name: 'Rural Health Unit',
    code: 'RHU',
    description: 'Health programs, medical certificates, and immunization',
    head: 'Municipal Health Officer',
    email: 'rhu@aloguinsan.gov.ph',
    phone: '032-000-0004',
    color: '#DC2626',  // Red — universally associated with health and medicine
    icon: 'heart-pulse',
    keywords: ['health', 'medical', 'hospital', 'medicine', 'immunization', 'vaccine', 'doctor', 'nurse', 'certificate', 'sick', 'disease', 'sanitation', 'nutrition'],
  },
  {
    // Municipal Planning and Development Office — manages land-use planning,
    // business permit applications, zoning, development programmes, and
    // livelihood / enterprise registration.
    name: 'MPDO',
    code: 'MPDO',
    description: 'Land use, business permits, and development plans',
    head: 'Municipal Planning Officer',
    email: 'mpdo@aloguinsan.gov.ph',
    phone: '032-000-0005',
    color: '#7C3AED',  // Violet — associated with planning and strategy
    icon: 'map',
    keywords: ['land', 'business', 'permit', 'zoning', 'development', 'plan', 'subdivision', 'lot', 'property', 'commercial', 'enterprise', 'livelihood'],
  },
  {
    // Municipal Environment and Natural Resources Office — takes complaints
    // about illegal logging, quarrying, waste dumping, water-body pollution,
    // and manages solid-waste and environmental programmes.
    name: 'MENRO',
    code: 'MENRO',
    description: 'Environmental complaints, illegal logging, and waste management',
    head: 'MENRO Head',
    email: 'menro@aloguinsan.gov.ph',
    phone: '032-000-0006',
    color: '#16A34A',  // Green — associated with the environment and nature
    icon: 'leaf',
    keywords: ['environment', 'logging', 'waste', 'garbage', 'pollution', 'mining', 'tree', 'forest', 'river', 'fishery', 'quarry', 'dump', 'trash', 'littering'],
  },
  {
    // Philippine National Police (local station) — handles peace-and-order
    // concerns, crime reports, blotter filing, and community safety requests.
    name: 'Philippine National Police',
    code: 'PNP',
    description: 'Peace and order, criminal reports, and community safety',
    head: 'Chief of Police',
    email: 'pnp@aloguinsan.gov.ph',
    phone: '032-000-0007',
    color: '#1E40AF',  // Dark blue — standard colour for law enforcement
    icon: 'shield',
    keywords: ['police', 'crime', 'theft', 'robbery', 'violence', 'safety', 'security', 'blotter', 'complaint', 'illegal', 'drugs', 'threat', 'assault'],
  },
  {
    // Treasurer's Office — processes tax payments, real-property assessments,
    // business-tax clearances, and handles cashier / receipt inquiries.
    name: "Treasurer's Office",
    code: 'TREASURER',
    description: 'Tax clearance, payment inquiries, and business tax',
    head: 'Municipal Treasurer',
    email: 'treasurer@aloguinsan.gov.ph',
    phone: '032-000-0008',
    color: '#B45309',  // Amber-brown — associated with finance and treasury
    icon: 'banknote',
    keywords: ['tax', 'payment', 'clearance', 'receipt', 'real property', 'business tax', 'assessment', 'fees', 'fine', 'cashier', 'treasury'],
  },
];

// =============================================================================
// Servant (government employee) seed data
//
// Each entry represents a staff member who will be created and assigned to
// the department identified by `deptCode`.  At least one servant is seeded
// per department so that the auto-assignment engine has someone to route
// tickets to from day one.  All servants share the default password
// "servant123" (hashed at runtime).
// =============================================================================
const servants = [
  // Mayor's Office — administrative and records staff
  { name: 'Maria Santos',    position: 'Administrative Officer', email: 'maria.santos@aloguinsan.gov.ph',    deptCode: 'MAYORS' },
  { name: 'Jose Reyes',      position: 'Records Officer',        email: 'jose.reyes@aloguinsan.gov.ph',      deptCode: 'MAYORS' },

  // Municipal Engineering Office — civil engineers handling infrastructure tickets
  { name: 'Ana Cruz',        position: 'Engineer I',             email: 'ana.cruz@aloguinsan.gov.ph',         deptCode: 'ENGINEERING' },
  { name: 'Pedro Dela Cruz', position: 'Engineer II',            email: 'pedro.delacruz@aloguinsan.gov.ph',   deptCode: 'ENGINEERING' },

  // MSWDO — social welfare officer handling PWD, senior, and family assistance
  { name: 'Lourdes Macaraeg', position: 'Social Welfare Officer', email: 'lourdes.macaraeg@aloguinsan.gov.ph', deptCode: 'MSWDO' },

  // Rural Health Unit — medical officer and public health nurse
  { name: 'Roberto Tan',     position: 'Medical Officer',        email: 'roberto.tan@aloguinsan.gov.ph',       deptCode: 'RHU' },
  { name: 'Carmen Villanueva', position: 'Public Health Nurse',  email: 'carmen.villanueva@aloguinsan.gov.ph', deptCode: 'RHU' },

  // MPDO — planning officer managing land-use and business permit tickets
  { name: 'Eduardo Flores',  position: 'Planning Officer',       email: 'eduardo.flores@aloguinsan.gov.ph',    deptCode: 'MPDO' },

  // MENRO — environment officer handling pollution and waste complaints
  { name: 'Rosario Mendoza', position: 'Environment Officer',    email: 'rosario.mendoza@aloguinsan.gov.ph',   deptCode: 'MENRO' },

  // PNP — police officer handling peace-and-order reports
  { name: 'Antonio Ramos',   position: 'Police Officer',         email: 'antonio.ramos@aloguinsan.gov.ph',     deptCode: 'PNP' },

  // Treasurer's Office — revenue officer handling tax and payment inquiries
  { name: 'Remedios Garcia', position: 'Revenue Officer',        email: 'remedios.garcia@aloguinsan.gov.ph',   deptCode: 'TREASURER' },
];

/**
 * main — entry point for the seed script.
 *
 * Execution order:
 *   1. Upsert all departments (keyed on `code`).
 *   2. Upsert all servants (keyed on `email`), linking each to its department.
 *   3. Upsert the system admin user (keyed on `email`).
 *   4. Upsert the sample resident user (keyed on `email`).
 *
 * Upserts are used throughout so the script is safe to re-run without
 * creating duplicate records.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log('🌱 Seeding database...');

  // ---------------------------------------------------------------------------
  // Step 1 — Departments
  //
  // Each department is upserted using its unique `code` as the lookup key.
  // A map of code → database ID is built so servants can be linked to their
  // department in the next step without an extra query.
  // ---------------------------------------------------------------------------
  const deptMap = {};  // Maps department code (e.g. 'MAYORS') to its DB primary key
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },  // Unique key used for idempotent upsert
      update: dept,                // Re-apply all fields if the record already exists
      create: dept,                // Insert a fresh record if it does not exist yet
    });
    deptMap[dept.code] = d.id;     // Store the resolved DB id for servant linking below
    console.log(`✅ Department: ${dept.name}`);
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Servants (government employees)
  //
  // A single bcrypt hash is computed once and reused for all servant accounts
  // to avoid redundant hashing overhead.  Each servant is upserted by email;
  // existing records are left unchanged on conflict (update: {}) so that any
  // manually updated profile data is not overwritten on re-seed.
  // ---------------------------------------------------------------------------
  const hashedPassword = await bcrypt.hash('servant123', 10);  // Default password for all seeded servants
  for (const s of servants) {
    await prisma.servant.upsert({
      where: { email: s.email },  // Email is the unique key for servants
      update: {},                 // Do not overwrite existing servant data on re-seed
      create: {
        name:         s.name,
        position:     s.position,
        email:        s.email,
        password:     hashedPassword,           // Shared default password (bcrypt-hashed)
        departmentId: deptMap[s.deptCode],      // Resolved from the map built in Step 1
      },
    });
    console.log(`✅ Servant: ${s.name}`);
  }

  // ---------------------------------------------------------------------------
  // Step 3 — System Administrator account
  //
  // A single admin user is created with the ADMIN role and full verification.
  // This account is used to access the admin dashboard and manage the platform.
  // Existing record is not overwritten on re-seed.
  // ---------------------------------------------------------------------------
  const adminPassword = await bcrypt.hash('admin123', 10);  // Admin default password
  await prisma.user.upsert({
    where: { email: 'admin@aloguinsan.gov.ph' },
    update: {},  // Do not overwrite an existing admin account on re-seed
    create: {
      name:       'System Administrator',
      email:      'admin@aloguinsan.gov.ph',
      barangay:   'Poblacion',        // Home barangay of the admin (seat of local government)
      password:   adminPassword,
      role:       'ADMIN',            // Elevated role granting full platform access
      isVerified: true,               // Pre-verified — no OTP confirmation required
    },
  });
  console.log('✅ Admin user created');

  // ---------------------------------------------------------------------------
  // Step 4 — Sample citizen / resident accounts
  //
  // Demo CLIENT accounts representing typical Aloguinsan residents from
  // different barangays. Used for testing, UI demos, and end-to-end suites.
  // All share the password "resident123". Existing records are not overwritten.
  // ---------------------------------------------------------------------------
  const residentPassword = await bcrypt.hash('resident123', 10);

  const citizens = [
    { name: 'Juan Dela Cruz',     email: 'juan.delacruz@example.com',     phone: '09171234567', barangay: 'Cabigohan',      address: 'Purok 1, Cabigohan' },
    { name: 'Maria Clara Santos', email: 'maria.clara@example.com',       phone: '09181234568', barangay: 'Poblacion',       address: 'Purok 3, Poblacion' },
    { name: 'Pedro Penduko',      email: 'pedro.penduko@example.com',     phone: '09191234569', barangay: 'Kantabogon',      address: 'Sitio Lawis, Kantabogon' },
    { name: 'Rosa Magtanggol',    email: 'rosa.magtanggol@example.com',   phone: '09201234570', barangay: 'Lawaan',          address: 'Purok 2, Lawaan' },
    { name: 'Andres Bonifacio',   email: 'andres.bonifacio@example.com',  phone: '09211234571', barangay: 'Ta-al',           address: 'Purok 5, Ta-al' },
    { name: 'Gabriela Silang',    email: 'gabriela.silang@example.com',   phone: '09221234572', barangay: 'Compostela',      address: 'Purok 1, Compostela' },
    { name: 'Emilio Jacinto',     email: 'emilio.jacinto@example.com',    phone: '09231234573', barangay: 'Punay',           address: 'Sitio Centro, Punay' },
    { name: 'Josefa Llanes',      email: 'josefa.llanes@example.com',     phone: '09241234574', barangay: 'Rosario',         address: 'Purok 4, Rosario' },
    { name: 'Apolinario Mabini',  email: 'apolinario.mabini@example.com', phone: '09251234575', barangay: 'Dumlog',          address: 'Purok 6, Dumlog' },
    { name: 'Tandang Sora',       email: 'tandang.sora@example.com',      phone: '09261234576', barangay: 'San Vicente',     address: 'Purok 2, San Vicente' },
  ];

  for (const c of citizens) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name:       c.name,
        email:      c.email,
        phone:      c.phone,
        barangay:   c.barangay,
        address:    c.address,
        password:   residentPassword,
        role:       'CLIENT',
        isVerified: true,
      },
    });
    console.log(`✅ Citizen: ${c.name}`);
  }

  // ===========================================================================
  // 5. Barangay Directory entries
  // ===========================================================================
  console.log('\n📒 Seeding directory entries...');

  const directoryEntries = [
    // ── Officials ──
    { id: 'dir_off_001', name: 'Hon. Christopher Garcia', position: 'Municipal Mayor', department: "Mayor's Office", phone: '032-480-9001', email: 'mayor@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_002', name: 'Hon. Maria Elena Santos', position: 'Vice Mayor', department: 'Office of the Vice Mayor', phone: '032-480-9002', email: 'vicemayor@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_003', name: 'Engr. Roberto Dela Cruz', position: 'Municipal Engineer', department: 'Municipal Engineering Office', phone: '032-480-9010', email: 'engineering@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_004', name: 'Dr. Rosalinda Mercado', position: 'Municipal Health Officer', department: 'Rural Health Unit', phone: '032-480-9020', email: 'rhu@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Rural Health Unit Bldg, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_005', name: 'Mrs. Carolina Villanueva', position: 'MSWDO Head', department: 'Municipal Social Welfare & Development Office', phone: '032-480-9030', email: 'mswdo@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_006', name: 'Mr. Antonio Ramos', position: 'Municipal Planning & Dev. Coordinator', department: 'Municipal Planning & Development Office', phone: '032-480-9040', email: 'mpdo@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_007', name: 'Mrs. Juanita Lopez', position: 'Municipal Treasurer', department: "Treasurer's Office", phone: '032-480-9050', email: 'treasurer@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_008', name: 'Mr. Fernando Torres', position: 'Municipal Environment & Natural Resources Officer', department: 'MENRO', phone: '032-480-9060', email: 'menro@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_009', name: 'Mrs. Gloria Reyes', position: 'Municipal Civil Registrar', department: 'Office of the Civil Registrar', phone: '032-480-9070', email: 'civilregistrar@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    { id: 'dir_off_010', name: 'Mr. Eduardo Navarro', position: 'Municipal Assessor', department: "Municipal Assessor's Office", phone: '032-480-9080', email: 'assessor@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'OFFICIAL' },
    // ── Emergency Services ──
    { id: 'dir_emer_001', name: 'PNP Aloguinsan', position: 'Municipal Police Station', department: 'Philippine National Police', phone: '032-480-9100', email: 'pnp.aloguinsan@pnp.gov.ph', officeHours: '24/7', address: 'Poblacion, Aloguinsan, Cebu', category: 'EMERGENCY' },
    { id: 'dir_emer_002', name: 'BFP Aloguinsan', position: 'Fire Station', department: 'Bureau of Fire Protection', phone: '032-480-9110', email: null, officeHours: '24/7', address: 'Poblacion, Aloguinsan, Cebu', category: 'EMERGENCY' },
    { id: 'dir_emer_003', name: 'MDRRMO Aloguinsan', position: 'Disaster Risk Reduction & Management Office', department: 'MDRRMO', phone: '032-480-9120', email: 'mdrrmo@aloguinsan.gov.ph', officeHours: '24/7', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'EMERGENCY' },
    { id: 'dir_emer_004', name: 'Aloguinsan Rural Health Unit', position: 'Emergency Health Services', department: 'Rural Health Unit', phone: '032-480-9020', email: 'rhu@aloguinsan.gov.ph', officeHours: '24/7 (Emergency)', address: 'Rural Health Unit Bldg, Poblacion, Aloguinsan', category: 'EMERGENCY' },
    { id: 'dir_emer_005', name: 'Philippine Red Cross – Cebu Chapter', position: 'Disaster Response & Blood Services', department: 'Philippine Red Cross', phone: '032-253-6325', email: null, officeHours: '24/7 Hotline', address: 'Cebu City (serves Aloguinsan area)', category: 'EMERGENCY' },
    // ── Government Services ──
    { id: 'dir_svc_001', name: 'Municipal Business Permits & Licensing', position: 'Business Permit Applications & Renewal', department: "Mayor's Office – BPLO", phone: '032-480-9090', email: 'bplo@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
    { id: 'dir_svc_002', name: 'Municipal Agriculture Office', position: 'Farmer Registration, Agri-assistance Programs', department: 'Municipal Agriculture Office', phone: '032-480-9130', email: 'agriculture@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
    { id: 'dir_svc_003', name: 'Senior Citizens Affairs Office', position: 'Senior Citizen ID, Benefits & Programs', department: 'OSCA / MSWDO', phone: '032-480-9031', email: 'osca@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
    { id: 'dir_svc_004', name: 'Persons with Disability Affairs', position: 'PWD ID Registration & Support Programs', department: 'MSWDO', phone: '032-480-9032', email: 'pwd@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
    { id: 'dir_svc_005', name: 'ALOGUINSAN Water District', position: 'Water Service Connection & Billing', department: 'Aloguinsan Water District', phone: '032-480-9140', email: null, officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Poblacion, Aloguinsan, Cebu', category: 'SERVICE' },
    { id: 'dir_svc_006', name: 'VECO / Electric Cooperative', position: 'Power Connection, Billing & Outage Reports', department: 'Visayan Electric / CEBECO', phone: '032-232-8888', email: null, officeHours: 'Mon–Sat 8:00 AM – 5:00 PM', address: 'Service Center, Cebu (covers Aloguinsan)', category: 'SERVICE' },
    { id: 'dir_svc_007', name: 'PhilHealth Office – Aloguinsan', position: 'PhilHealth Membership & Claims Assistance', department: 'PhilHealth', phone: '032-480-9150', email: null, officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
    { id: 'dir_svc_008', name: 'Sangguniang Bayan Office', position: 'Legislative Services & Resolutions', department: 'Sangguniang Bayan', phone: '032-480-9003', email: 'sb@aloguinsan.gov.ph', officeHours: 'Mon–Fri 8:00 AM – 5:00 PM', address: 'Municipal Hall, Poblacion, Aloguinsan', category: 'SERVICE' },
  ];

  for (const d of directoryEntries) {
    await prisma.directoryEntry.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id:          d.id,
        name:        d.name,
        position:    d.position,
        department:  d.department,
        phone:       d.phone,
        email:       d.email,
        officeHours: d.officeHours,
        address:     d.address,
        category:    d.category,
        isActive:    true,
      },
    });
  }
  console.log(`✅ Directory: ${directoryEntries.length} entries seeded`);

  // Print a summary of default credentials for developer reference
  console.log('\n🎉 Seeding complete!');
  console.log('👤 Admin: admin@aloguinsan.gov.ph / admin123');
  console.log('👤 Citizens (10): juan.delacruz@example.com, maria.clara@example.com, ... / resident123');
  console.log('👤 Servants (11): maria.santos@aloguinsan.gov.ph, ... / servant123');
  console.log('📒 Directory: 23 entries (10 officials, 5 emergency, 8 services)');
}

// Run the seed and ensure the Prisma client is always disconnected afterwards,
// even if an error is thrown during seeding.
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
