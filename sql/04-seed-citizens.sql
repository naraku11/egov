-- =============================================================================
-- E-Government Assistance System — Municipality of Aluguinsan, Cebu
-- FILE 4: Citizens / Residents (run after 01-schema.sql)
-- =============================================================================
-- Password for all: resident123
-- =============================================================================
--
-- ┌─────────────────────┬───────────────────────────────────────┬──────────────┬────────────────────────────┐
-- │ Name                │ Email                                 │ Phone        │ Barangay                   │
-- ├─────────────────────┼───────────────────────────────────────┼──────────────┼────────────────────────────┤
-- │ Juan Dela Cruz      │ juan.delacruz@example.com             │ 09171234567  │ Cabigohan                  │
-- │ Maria Clara Santos  │ maria.clara@example.com               │ 09181234568  │ Poblacion                  │
-- │ Pedro Penduko       │ pedro.penduko@example.com             │ 09191234569  │ Kantabogon                 │
-- │ Rosa Magtanggol     │ rosa.magtanggol@example.com           │ 09201234570  │ Lawaan                     │
-- │ Andres Bonifacio    │ andres.bonifacio@example.com          │ 09211234571  │ Ta-al                      │
-- │ Gabriela Silang     │ gabriela.silang@example.com           │ 09221234572  │ Compostela                 │
-- │ Emilio Jacinto      │ emilio.jacinto@example.com            │ 09231234573  │ Punay                      │
-- │ Josefa Llanes       │ josefa.llanes@example.com             │ 09241234574  │ Rosario                    │
-- │ Apolinario Mabini   │ apolinario.mabini@example.com         │ 09251234575  │ Dumlog                     │
-- │ Tandang Sora        │ tandang.sora@example.com              │ 09261234576  │ San Vicente                │
-- └─────────────────────┴───────────────────────────────────────┴──────────────┴────────────────────────────┘

INSERT INTO `users` (`id`, `email`, `phone`, `name`, `barangay`, `address`, `role`, `password`, `isVerified`, `language`, `createdAt`, `updatedAt`) VALUES
('usr_juan',       'juan.delacruz@example.com',     '09171234567', 'Juan Dela Cruz',     'Cabigohan',   'Purok 1, Cabigohan',      'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_maria_c',    'maria.clara@example.com',       '09181234568', 'Maria Clara Santos', 'Poblacion',   'Purok 3, Poblacion',      'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_pedro',      'pedro.penduko@example.com',     '09191234569', 'Pedro Penduko',      'Kantabogon',  'Sitio Lawis, Kantabogon', 'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_rosa',       'rosa.magtanggol@example.com',   '09201234570', 'Rosa Magtanggol',    'Lawaan',      'Purok 2, Lawaan',         'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_andres',     'andres.bonifacio@example.com',  '09211234571', 'Andres Bonifacio',   'Ta-al',       'Purok 5, Ta-al',          'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_gabriela',   'gabriela.silang@example.com',   '09221234572', 'Gabriela Silang',    'Compostela',  'Purok 1, Compostela',     'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_emilio',     'emilio.jacinto@example.com',    '09231234573', 'Emilio Jacinto',     'Punay',       'Sitio Centro, Punay',     'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_josefa',     'josefa.llanes@example.com',     '09241234574', 'Josefa Llanes',      'Rosario',     'Purok 4, Rosario',        'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_apolinario', 'apolinario.mabini@example.com', '09251234575', 'Apolinario Mabini',  'Dumlog',      'Purok 6, Dumlog',         'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_tandang',    'tandang.sora@example.com',      '09261234576', 'Tandang Sora',       'San Vicente', 'Purok 2, San Vicente',    'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
