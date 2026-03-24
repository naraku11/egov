-- =============================================================================
-- E-Government Assistance System — Municipality of Aloguinsan, Cebu
-- FILE 3: Government Servants / Employees (run after 01-schema.sql)
-- =============================================================================
-- Password for all: servant123
-- =============================================================================
--
-- ┌─────────────────────┬──────────────────────┬──────────────────────────────────────────┐
-- │ Name                │ Position             │ Department                               │
-- ├─────────────────────┼──────────────────────┼──────────────────────────────────────────┤
-- │ Maria Santos        │ Administrative Officer│ Mayor's Office                          │
-- │ Jose Reyes          │ Records Officer       │ Mayor's Office                          │
-- │ Ana Cruz            │ Engineer I            │ Municipal Engineering Office             │
-- │ Pedro Dela Cruz     │ Engineer II           │ Municipal Engineering Office             │
-- │ Lourdes Macaraeg    │ Social Welfare Officer│ MSWDO                                   │
-- │ Roberto Tan         │ Medical Officer       │ Rural Health Unit                       │
-- │ Carmen Villanueva   │ Public Health Nurse   │ Rural Health Unit                       │
-- │ Eduardo Flores      │ Planning Officer      │ MPDO                                    │
-- │ Rosario Mendoza     │ Environment Officer   │ MENRO                                   │
-- │ Antonio Ramos       │ Police Officer        │ PNP                                     │
-- │ Remedios Garcia     │ Revenue Officer       │ Treasurer's Office                      │
-- └─────────────────────┴──────────────────────┴──────────────────────────────────────────┘

INSERT INTO `servants` (`id`, `email`, `name`, `position`, `phone`, `password`, `departmentId`, `status`, `workload`, `createdAt`, `updatedAt`) VALUES
('srv_maria',    'maria.santos@aloguinsan.gov.ph',      'Maria Santos',       'Administrative Officer', NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mayors',      'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_jose',     'jose.reyes@aloguinsan.gov.ph',        'Jose Reyes',         'Records Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mayors',      'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_ana',      'ana.cruz@aloguinsan.gov.ph',           'Ana Cruz',           'Engineer I',             NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_engineering', 'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_pedro',    'pedro.delacruz@aloguinsan.gov.ph',     'Pedro Dela Cruz',    'Engineer II',            NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_engineering', 'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_lourdes',  'lourdes.macaraeg@aloguinsan.gov.ph',   'Lourdes Macaraeg',   'Social Welfare Officer', NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mswdo',       'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_roberto',  'roberto.tan@aloguinsan.gov.ph',        'Roberto Tan',        'Medical Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_rhu',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_carmen',   'carmen.villanueva@aloguinsan.gov.ph',   'Carmen Villanueva',  'Public Health Nurse',    NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_rhu',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_eduardo',  'eduardo.flores@aloguinsan.gov.ph',     'Eduardo Flores',     'Planning Officer',       NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mpdo',        'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_rosario',  'rosario.mendoza@aloguinsan.gov.ph',    'Rosario Mendoza',    'Environment Officer',    NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_menro',       'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_antonio',  'antonio.ramos@aloguinsan.gov.ph',      'Antonio Ramos',      'Police Officer',         NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_pnp',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_remedios', 'remedios.garcia@aloguinsan.gov.ph',    'Remedios Garcia',    'Revenue Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_treasurer',   'AVAILABLE', 0, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
