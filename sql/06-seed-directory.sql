-- Seed data for the Barangay Directory (directory_entries table)
-- Municipality of Aluguinsan, Cebu
-- Run after 01-schema.sql

INSERT INTO `directory_entries` (`id`, `name`, `position`, `department`, `phone`, `email`, `officeHours`, `address`, `category`, `isActive`, `createdAt`, `updatedAt`) VALUES

-- ═══════════════════════════════════════════════════════════════════
-- OFFICIALS
-- ═══════════════════════════════════════════════════════════════════
('dir_off_001', 'Hon. Christopher Garcia', 'Municipal Mayor', 'Mayor''s Office', '032-480-9001', 'mayor@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_002', 'Hon. Maria Elena Santos', 'Vice Mayor', 'Office of the Vice Mayor', '032-480-9002', 'vicemayor@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_003', 'Engr. Roberto Dela Cruz', 'Municipal Engineer', 'Municipal Engineering Office', '032-480-9010', 'engineering@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_004', 'Dr. Rosalinda Mercado', 'Municipal Health Officer', 'Rural Health Unit', '032-480-9020', 'rhu@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Rural Health Unit Bldg, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_005', 'Mrs. Carolina Villanueva', 'MSWDO Head', 'Municipal Social Welfare & Development Office', '032-480-9030', 'mswdo@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_006', 'Mr. Antonio Ramos', 'Municipal Planning & Dev. Coordinator', 'Municipal Planning & Development Office', '032-480-9040', 'mpdo@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_007', 'Mrs. Juanita Lopez', 'Municipal Treasurer', 'Treasurer''s Office', '032-480-9050', 'treasurer@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_008', 'Mr. Fernando Torres', 'Municipal Environment & Natural Resources Officer', 'MENRO', '032-480-9060', 'menro@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_009', 'Mrs. Gloria Reyes', 'Municipal Civil Registrar', 'Office of the Civil Registrar', '032-480-9070', 'civilregistrar@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),
('dir_off_010', 'Mr. Eduardo Navarro', 'Municipal Assessor', 'Municipal Assessor''s Office', '032-480-9080', 'assessor@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'OFFICIAL', true, NOW(), NOW()),

-- ═══════════════════════════════════════════════════════════════════
-- EMERGENCY SERVICES
-- ═══════════════════════════════════════════════════════════════════
('dir_emer_001', 'PNP Aluguinsan', 'Municipal Police Station', 'Philippine National Police', '032-480-9100', 'pnp.aluguinsan@pnp.gov.ph', '24/7', 'Poblacion, Aluguinsan, Cebu', 'EMERGENCY', true, NOW(), NOW()),
('dir_emer_002', 'BFP Aluguinsan', 'Fire Station', 'Bureau of Fire Protection', '032-480-9110', NULL, '24/7', 'Poblacion, Aluguinsan, Cebu', 'EMERGENCY', true, NOW(), NOW()),
('dir_emer_003', 'MDRRMO Aluguinsan', 'Disaster Risk Reduction & Management Office', 'MDRRMO', '032-480-9120', 'mdrrmo@aluguinsan.gov.ph', '24/7', 'Municipal Hall, Poblacion, Aluguinsan', 'EMERGENCY', true, NOW(), NOW()),
('dir_emer_004', 'Aluguinsan Rural Health Unit', 'Emergency Health Services', 'Rural Health Unit', '032-480-9020', 'rhu@aluguinsan.gov.ph', '24/7 (Emergency)', 'Rural Health Unit Bldg, Poblacion, Aluguinsan', 'EMERGENCY', true, NOW(), NOW()),
('dir_emer_005', 'Philippine Red Cross – Cebu Chapter', 'Disaster Response & Blood Services', 'Philippine Red Cross', '032-253-6325', NULL, '24/7 Hotline', 'Cebu City (serves Aluguinsan area)', 'EMERGENCY', true, NOW(), NOW()),

-- ═══════════════════════════════════════════════════════════════════
-- GOVERNMENT SERVICES
-- ═══════════════════════════════════════════════════════════════════
('dir_svc_001', 'Municipal Business Permits & Licensing', 'Business Permit Applications & Renewal', 'Mayor''s Office – BPLO', '032-480-9090', 'bplo@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW()),
('dir_svc_002', 'Municipal Agriculture Office', 'Farmer Registration, Agri-assistance Programs', 'Municipal Agriculture Office', '032-480-9130', 'agriculture@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW()),
('dir_svc_003', 'Senior Citizens Affairs Office', 'Senior Citizen ID, Benefits & Programs', 'OSCA / MSWDO', '032-480-9031', 'osca@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW()),
('dir_svc_004', 'Persons with Disability Affairs', 'PWD ID Registration & Support Programs', 'MSWDO', '032-480-9032', 'pwd@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW()),
('dir_svc_005', 'ALUGUINSAN Water District', 'Water Service Connection & Billing', 'Aluguinsan Water District', '032-480-9140', NULL, 'Mon–Fri 8:00 AM – 5:00 PM', 'Poblacion, Aluguinsan, Cebu', 'SERVICE', true, NOW(), NOW()),
('dir_svc_006', 'VECO / Electric Cooperative', 'Power Connection, Billing & Outage Reports', 'Visayan Electric / CEBECO', '032-232-8888', NULL, 'Mon–Sat 8:00 AM – 5:00 PM', 'Service Center, Cebu (covers Aluguinsan)', 'SERVICE', true, NOW(), NOW()),
('dir_svc_007', 'PhilHealth Office – Aluguinsan', 'PhilHealth Membership & Claims Assistance', 'PhilHealth', '032-480-9150', NULL, 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW()),
('dir_svc_008', 'Sangguniang Bayan Office', 'Legislative Services & Resolutions', 'Sangguniang Bayan', '032-480-9003', 'sb@aluguinsan.gov.ph', 'Mon–Fri 8:00 AM – 5:00 PM', 'Municipal Hall, Poblacion, Aluguinsan', 'SERVICE', true, NOW(), NOW());
