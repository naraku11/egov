import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const departments = [
  {
    name: "Mayor's Office",
    code: 'MAYORS',
    description: 'General inquiries, official documents, and barangay coordination',
    head: 'Hon. Mayor',
    email: 'mayor@aluguinsan.gov.ph',
    phone: '032-000-0001',
    color: '#1D4ED8',
    icon: 'star',
    keywords: ['mayor', 'general inquiry', 'document', 'certificate', 'barangay', 'coordination', 'permit', 'endorsement', 'clearance'],
  },
  {
    name: 'Municipal Engineering Office',
    code: 'ENGINEERING',
    description: 'Road damage, flood control, and infrastructure requests',
    head: 'Municipal Engineer',
    email: 'engineering@aluguinsan.gov.ph',
    phone: '032-000-0002',
    color: '#D97706',
    icon: 'wrench',
    keywords: ['road', 'flood', 'infrastructure', 'bridge', 'drainage', 'pothole', 'construction', 'repair', 'building', 'structure', 'engineering'],
  },
  {
    name: 'MSWDO',
    code: 'MSWDO',
    description: 'Social welfare, PWD assistance, and senior citizen benefits',
    head: 'MSWDO Head',
    email: 'mswdo@aluguinsan.gov.ph',
    phone: '032-000-0003',
    color: '#059669',
    icon: 'heart',
    keywords: ['social', 'welfare', 'pwd', 'disability', 'senior', 'citizen', 'elderly', 'indigent', 'solo parent', 'child', 'family', 'assistance', 'benefit', '4ps'],
  },
  {
    name: 'Rural Health Unit',
    code: 'RHU',
    description: 'Health programs, medical certificates, and immunization',
    head: 'Municipal Health Officer',
    email: 'rhu@aluguinsan.gov.ph',
    phone: '032-000-0004',
    color: '#DC2626',
    icon: 'heart-pulse',
    keywords: ['health', 'medical', 'hospital', 'medicine', 'immunization', 'vaccine', 'doctor', 'nurse', 'certificate', 'sick', 'disease', 'sanitation', 'nutrition'],
  },
  {
    name: 'MPDO',
    code: 'MPDO',
    description: 'Land use, business permits, and development plans',
    head: 'Municipal Planning Officer',
    email: 'mpdo@aluguinsan.gov.ph',
    phone: '032-000-0005',
    color: '#7C3AED',
    icon: 'map',
    keywords: ['land', 'business', 'permit', 'zoning', 'development', 'plan', 'subdivision', 'lot', 'property', 'commercial', 'enterprise', 'livelihood'],
  },
  {
    name: 'MENRO',
    code: 'MENRO',
    description: 'Environmental complaints, illegal logging, and waste management',
    head: 'MENRO Head',
    email: 'menro@aluguinsan.gov.ph',
    phone: '032-000-0006',
    color: '#16A34A',
    icon: 'leaf',
    keywords: ['environment', 'logging', 'waste', 'garbage', 'pollution', 'mining', 'tree', 'forest', 'river', 'fishery', 'quarry', 'dump', 'trash', 'littering'],
  },
  {
    name: 'Philippine National Police',
    code: 'PNP',
    description: 'Peace and order, criminal reports, and community safety',
    head: 'Chief of Police',
    email: 'pnp@aluguinsan.gov.ph',
    phone: '032-000-0007',
    color: '#1E40AF',
    icon: 'shield',
    keywords: ['police', 'crime', 'theft', 'robbery', 'violence', 'safety', 'security', 'blotter', 'complaint', 'illegal', 'drugs', 'threat', 'assault'],
  },
  {
    name: "Treasurer's Office",
    code: 'TREASURER',
    description: 'Tax clearance, payment inquiries, and business tax',
    head: 'Municipal Treasurer',
    email: 'treasurer@aluguinsan.gov.ph',
    phone: '032-000-0008',
    color: '#B45309',
    icon: 'banknote',
    keywords: ['tax', 'payment', 'clearance', 'receipt', 'real property', 'business tax', 'assessment', 'fees', 'fine', 'cashier', 'treasury'],
  },
];

const servants = [
  { name: 'Maria Santos', position: 'Administrative Officer', email: 'maria.santos@aluguinsan.gov.ph', deptCode: 'MAYORS' },
  { name: 'Jose Reyes', position: 'Records Officer', email: 'jose.reyes@aluguinsan.gov.ph', deptCode: 'MAYORS' },
  { name: 'Ana Cruz', position: 'Engineer I', email: 'ana.cruz@aluguinsan.gov.ph', deptCode: 'ENGINEERING' },
  { name: 'Pedro Dela Cruz', position: 'Engineer II', email: 'pedro.delacruz@aluguinsan.gov.ph', deptCode: 'ENGINEERING' },
  { name: 'Lourdes Macaraeg', position: 'Social Welfare Officer', email: 'lourdes.macaraeg@aluguinsan.gov.ph', deptCode: 'MSWDO' },
  { name: 'Roberto Tan', position: 'Medical Officer', email: 'roberto.tan@aluguinsan.gov.ph', deptCode: 'RHU' },
  { name: 'Carmen Villanueva', position: 'Public Health Nurse', email: 'carmen.villanueva@aluguinsan.gov.ph', deptCode: 'RHU' },
  { name: 'Eduardo Flores', position: 'Planning Officer', email: 'eduardo.flores@aluguinsan.gov.ph', deptCode: 'MPDO' },
  { name: 'Rosario Mendoza', position: 'Environment Officer', email: 'rosario.mendoza@aluguinsan.gov.ph', deptCode: 'MENRO' },
  { name: 'Antonio Ramos', position: 'Police Officer', email: 'antonio.ramos@aluguinsan.gov.ph', deptCode: 'PNP' },
  { name: 'Remedios Garcia', position: 'Revenue Officer', email: 'remedios.garcia@aluguinsan.gov.ph', deptCode: 'TREASURER' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Create departments
  const deptMap = {};
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },
      update: dept,
      create: dept,
    });
    deptMap[dept.code] = d.id;
    console.log(`✅ Department: ${dept.name}`);
  }

  // Create servants
  const hashedPassword = await bcrypt.hash('servant123', 10);
  for (const s of servants) {
    await prisma.servant.upsert({
      where: { email: s.email },
      update: {},
      create: {
        name: s.name,
        position: s.position,
        email: s.email,
        password: hashedPassword,
        departmentId: deptMap[s.deptCode],
      },
    });
    console.log(`✅ Servant: ${s.name}`);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@aluguinsan.gov.ph' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@aluguinsan.gov.ph',
      barangay: 'Poblacion',
      password: adminPassword,
      role: 'ADMIN',
      isVerified: true,
    },
  });
  console.log('✅ Admin user created');

  // Create sample resident
  const residentPassword = await bcrypt.hash('resident123', 10);
  await prisma.user.upsert({
    where: { email: 'juan.delacruz@example.com' },
    update: {},
    create: {
      name: 'Juan Dela Cruz',
      email: 'juan.delacruz@example.com',
      phone: '09171234567',
      barangay: 'Cabigohan',
      address: 'Purok 1, Cabigohan',
      password: residentPassword,
      role: 'CLIENT',
      isVerified: true,
    },
  });
  console.log('✅ Sample resident created');

  console.log('\n🎉 Seeding complete!');
  console.log('👤 Admin: admin@aluguinsan.gov.ph / admin123');
  console.log('👤 Resident: juan.delacruz@example.com / resident123');
  console.log('👤 Servant example: maria.santos@aluguinsan.gov.ph / servant123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
