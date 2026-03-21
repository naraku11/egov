/**
 * @file seed.js
 *
 * Database seed script for the eGov municipal service desk application of
 * Aluguinsan, Cebu.
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
 *   Admin    — admin@aluguinsan.gov.ph  / admin123
 *   Resident — juan.delacruz@example.com / resident123
 *   Servants — <first>.<last>@aluguinsan.gov.ph / servant123
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
    email: 'mayor@aluguinsan.gov.ph',
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
    email: 'engineering@aluguinsan.gov.ph',
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
    email: 'mswdo@aluguinsan.gov.ph',
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
    email: 'rhu@aluguinsan.gov.ph',
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
    email: 'mpdo@aluguinsan.gov.ph',
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
    email: 'menro@aluguinsan.gov.ph',
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
    email: 'pnp@aluguinsan.gov.ph',
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
    email: 'treasurer@aluguinsan.gov.ph',
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
  { name: 'Maria Santos',    position: 'Administrative Officer', email: 'maria.santos@aluguinsan.gov.ph',    deptCode: 'MAYORS' },
  { name: 'Jose Reyes',      position: 'Records Officer',        email: 'jose.reyes@aluguinsan.gov.ph',      deptCode: 'MAYORS' },

  // Municipal Engineering Office — civil engineers handling infrastructure tickets
  { name: 'Ana Cruz',        position: 'Engineer I',             email: 'ana.cruz@aluguinsan.gov.ph',         deptCode: 'ENGINEERING' },
  { name: 'Pedro Dela Cruz', position: 'Engineer II',            email: 'pedro.delacruz@aluguinsan.gov.ph',   deptCode: 'ENGINEERING' },

  // MSWDO — social welfare officer handling PWD, senior, and family assistance
  { name: 'Lourdes Macaraeg', position: 'Social Welfare Officer', email: 'lourdes.macaraeg@aluguinsan.gov.ph', deptCode: 'MSWDO' },

  // Rural Health Unit — medical officer and public health nurse
  { name: 'Roberto Tan',     position: 'Medical Officer',        email: 'roberto.tan@aluguinsan.gov.ph',       deptCode: 'RHU' },
  { name: 'Carmen Villanueva', position: 'Public Health Nurse',  email: 'carmen.villanueva@aluguinsan.gov.ph', deptCode: 'RHU' },

  // MPDO — planning officer managing land-use and business permit tickets
  { name: 'Eduardo Flores',  position: 'Planning Officer',       email: 'eduardo.flores@aluguinsan.gov.ph',    deptCode: 'MPDO' },

  // MENRO — environment officer handling pollution and waste complaints
  { name: 'Rosario Mendoza', position: 'Environment Officer',    email: 'rosario.mendoza@aluguinsan.gov.ph',   deptCode: 'MENRO' },

  // PNP — police officer handling peace-and-order reports
  { name: 'Antonio Ramos',   position: 'Police Officer',         email: 'antonio.ramos@aluguinsan.gov.ph',     deptCode: 'PNP' },

  // Treasurer's Office — revenue officer handling tax and payment inquiries
  { name: 'Remedios Garcia', position: 'Revenue Officer',        email: 'remedios.garcia@aluguinsan.gov.ph',   deptCode: 'TREASURER' },
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
    where: { email: 'admin@aluguinsan.gov.ph' },
    update: {},  // Do not overwrite an existing admin account on re-seed
    create: {
      name:       'System Administrator',
      email:      'admin@aluguinsan.gov.ph',
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
  // Demo CLIENT accounts representing typical Aluguinsan residents from
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

  // Print a summary of default credentials for developer reference
  console.log('\n🎉 Seeding complete!');
  console.log('👤 Admin: admin@aluguinsan.gov.ph / admin123');
  console.log('👤 Citizens (10): juan.delacruz@example.com, maria.clara@example.com, ... / resident123');
  console.log('👤 Servants (11): maria.santos@aluguinsan.gov.ph, ... / servant123');
}

// Run the seed and ensure the Prisma client is always disconnected afterwards,
// even if an error is thrown during seeding.
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
