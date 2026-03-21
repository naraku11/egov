-- =============================================================================
-- E-Government Assistance System — Municipality of Aluguinsan, Cebu
-- FILE 2: Admin Account (run after 01-schema.sql)
-- =============================================================================
-- Email:    admin@aluguinsan.gov.ph
-- Password: admin123
-- =============================================================================

INSERT INTO `users` (`id`, `email`, `phone`, `name`, `barangay`, `address`, `role`, `password`, `isVerified`, `language`, `createdAt`, `updatedAt`) VALUES
('usr_admin', 'admin@aluguinsan.gov.ph', NULL, 'System Administrator', 'Poblacion', NULL, 'ADMIN',
 '$2a$10$FycHWAKSb3QldIofm04.te.VYk77u8iTtFD96ZDm//1ferY005Lha',
 true, 'ENGLISH', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
