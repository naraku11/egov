-- =============================================================================
-- E-Government Assistance System — Municipality of Aloguinsan, Cebu
-- Complete Database Schema + Seed Data for MySQL
-- =============================================================================
-- Run this SQL file in phpMyAdmin or MySQL CLI on Hostinger to set up the
-- database. Make sure the database (e.g. u856082912_egovdb) already exists.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── ENUMS (stored as MySQL ENUM types) ─────────────────────────────────────

-- ─── SCHEMA: Tables ─────────────────────────────────────────────────────────

-- Prisma migrations tracking table
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id` VARCHAR(36) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `finished_at` DATETIME(3) NULL,
  `migration_name` VARCHAR(255) NOT NULL,
  `logs` TEXT NULL,
  `rolled_back_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users (residents and admins)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `barangay` VARCHAR(191) NOT NULL,
  `address` VARCHAR(191) NULL,
  `role` ENUM('CLIENT', 'ADMIN') NOT NULL DEFAULT 'CLIENT',
  `password` VARCHAR(191) NULL,
  `isVerified` BOOLEAN NOT NULL DEFAULT false,
  `language` ENUM('ENGLISH', 'FILIPINO', 'CEBUANO') NOT NULL DEFAULT 'ENGLISH',
  `avatarUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `users_email_key` (`email`),
  UNIQUE INDEX `users_phone_key` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Departments
CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `head` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `keywords` JSON NOT NULL DEFAULT ('[]'),
  `color` VARCHAR(191) NOT NULL DEFAULT '#3B82F6',
  `icon` VARCHAR(191) NOT NULL DEFAULT 'building',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `departments_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Servants (government employees)
CREATE TABLE IF NOT EXISTS `servants` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `password` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `status` ENUM('AVAILABLE', 'BUSY', 'OFFLINE') NOT NULL DEFAULT 'AVAILABLE',
  `workload` INT NOT NULL DEFAULT 0,
  `avatarUrl` VARCHAR(191) NULL,
  `lastActiveAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `servants_email_key` (`email`),
  INDEX `servants_departmentId_idx` (`departmentId`),
  INDEX `servants_status_idx` (`status`),
  CONSTRAINT `servants_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tickets
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` VARCHAR(191) NOT NULL,
  `ticketNumber` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `servantId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED') NOT NULL DEFAULT 'PENDING',
  `priority` ENUM('LOW', 'NORMAL', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  `aiConfidence` DOUBLE NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `slaDeadline` DATETIME(3) NULL,
  `escalatedAt` DATETIME(3) NULL,
  `escalationReason` TEXT NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tickets_ticketNumber_key` (`ticketNumber`),
  INDEX `tickets_userId_idx` (`userId`),
  INDEX `tickets_servantId_idx` (`servantId`),
  INDEX `tickets_departmentId_idx` (`departmentId`),
  INDEX `tickets_status_idx` (`status`),
  INDEX `tickets_priority_idx` (`priority`),
  INDEX `tickets_slaDeadline_idx` (`slaDeadline`),
  CONSTRAINT `tickets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tickets_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tickets_servantId_fkey` FOREIGN KEY (`servantId`) REFERENCES `servants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attachments
CREATE TABLE IF NOT EXISTS `attachments` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `filePath` VARCHAR(191) NOT NULL,
  `fileSize` INT NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `attachments_ticketId_idx` (`ticketId`),
  CONSTRAINT `attachments_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Messages
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `servantId` VARCHAR(191) NULL,
  `senderType` ENUM('CLIENT', 'SERVANT', 'SYSTEM') NOT NULL,
  `senderName` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `isInternal` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ticket_messages_ticketId_idx` (`ticketId`),
  INDEX `ticket_messages_ticketId_isInternal_idx` (`ticketId`, `isInternal`),
  CONSTRAINT `ticket_messages_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ticket_messages_servantId_fkey` FOREIGN KEY (`servantId`) REFERENCES `servants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `isRead` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `notifications_userId_idx` (`userId`),
  INDEX `notifications_userId_isRead_idx` (`userId`, `isRead`),
  CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `notifications_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feedback
CREATE TABLE IF NOT EXISTS `feedbacks` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `feedbacks_ticketId_key` (`ticketId`),
  CONSTRAINT `feedbacks_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Announcements
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `category` ENUM('INFO', 'ALERT', 'EVENT') NOT NULL DEFAULT 'INFO',
  `isPublished` BOOLEAN NOT NULL DEFAULT true,
  `publishedAt` DATETIME(3) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `announcements_isPublished_idx` (`isPublished`),
  INDEX `announcements_category_idx` (`category`),
  CONSTRAINT `announcements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Directory Entries
CREATE TABLE IF NOT EXISTS `directory_entries` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` VARCHAR(191) NOT NULL,
  `department` VARCHAR(191) NULL,
  `address` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `officeHours` VARCHAR(191) NULL,
  `category` ENUM('OFFICIAL', 'EMERGENCY', 'SERVICE') NOT NULL DEFAULT 'OFFICIAL',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `directory_entries_category_idx` (`category`),
  INDEX `directory_entries_isActive_idx` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ─── Departments ────────────────────────────────────────────────────────────

INSERT INTO `departments` (`id`, `name`, `code`, `description`, `head`, `email`, `phone`, `color`, `icon`, `keywords`, `isActive`, `createdAt`, `updatedAt`) VALUES
('dept_mayors',      'Mayor''s Office',               'MAYORS',      'General inquiries, official documents, and barangay coordination',     'Hon. Mayor',                'mayor@aloguinsan.gov.ph',       '032-000-0001', '#1D4ED8', 'star',        '["mayor","general inquiry","document","certificate","barangay","coordination","permit","endorsement","clearance"]',                                           true, NOW(3), NOW(3)),
('dept_engineering', 'Municipal Engineering Office',   'ENGINEERING', 'Road damage, flood control, and infrastructure requests',              'Municipal Engineer',        'engineering@aloguinsan.gov.ph',  '032-000-0002', '#D97706', 'wrench',      '["road","flood","infrastructure","bridge","drainage","pothole","construction","repair","building","structure","engineering"]',                                  true, NOW(3), NOW(3)),
('dept_mswdo',       'MSWDO',                         'MSWDO',       'Social welfare, PWD assistance, and senior citizen benefits',           'MSWDO Head',                'mswdo@aloguinsan.gov.ph',        '032-000-0003', '#059669', 'heart',       '["social","welfare","pwd","disability","senior","citizen","elderly","indigent","solo parent","child","family","assistance","benefit","4ps"]',                   true, NOW(3), NOW(3)),
('dept_rhu',         'Rural Health Unit',              'RHU',         'Health programs, medical certificates, and immunization',               'Municipal Health Officer',  'rhu@aloguinsan.gov.ph',          '032-000-0004', '#DC2626', 'heart-pulse', '["health","medical","hospital","medicine","immunization","vaccine","doctor","nurse","certificate","sick","disease","sanitation","nutrition"]',                  true, NOW(3), NOW(3)),
('dept_mpdo',        'MPDO',                           'MPDO',        'Land use, business permits, and development plans',                    'Municipal Planning Officer','mpdo@aloguinsan.gov.ph',         '032-000-0005', '#7C3AED', 'map',         '["land","business","permit","zoning","development","plan","subdivision","lot","property","commercial","enterprise","livelihood"]',                              true, NOW(3), NOW(3)),
('dept_menro',       'MENRO',                          'MENRO',       'Environmental complaints, illegal logging, and waste management',       'MENRO Head',                'menro@aloguinsan.gov.ph',        '032-000-0006', '#16A34A', 'leaf',        '["environment","logging","waste","garbage","pollution","mining","tree","forest","river","fishery","quarry","dump","trash","littering"]',                        true, NOW(3), NOW(3)),
('dept_pnp',         'Philippine National Police',     'PNP',         'Peace and order, criminal reports, and community safety',               'Chief of Police',           'pnp@aloguinsan.gov.ph',          '032-000-0007', '#1E40AF', 'shield',      '["police","crime","theft","robbery","violence","safety","security","blotter","complaint","illegal","drugs","threat","assault"]',                                true, NOW(3), NOW(3)),
('dept_treasurer',   'Treasurer''s Office',            'TREASURER',   'Tax clearance, payment inquiries, and business tax',                    'Municipal Treasurer',       'treasurer@aloguinsan.gov.ph',    '032-000-0008', '#B45309', 'banknote',    '["tax","payment","clearance","receipt","real property","business tax","assessment","fees","fine","cashier","treasury"]',                                        true, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ─── Servants (government employees) ────────────────────────────────────────
-- Password: servant123 (bcrypt hash with 10 rounds)

INSERT INTO `servants` (`id`, `email`, `name`, `position`, `phone`, `password`, `departmentId`, `status`, `workload`, `createdAt`, `updatedAt`) VALUES
('srv_maria',    'maria.santos@aloguinsan.gov.ph',     'Maria Santos',       'Administrative Officer', NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mayors',      'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_jose',     'jose.reyes@aloguinsan.gov.ph',       'Jose Reyes',         'Records Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mayors',      'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_ana',      'ana.cruz@aloguinsan.gov.ph',          'Ana Cruz',           'Engineer I',             NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_engineering', 'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_pedro',    'pedro.delacruz@aloguinsan.gov.ph',    'Pedro Dela Cruz',    'Engineer II',            NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_engineering', 'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_lourdes',  'lourdes.macaraeg@aloguinsan.gov.ph',  'Lourdes Macaraeg',   'Social Welfare Officer', NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mswdo',       'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_roberto',  'roberto.tan@aloguinsan.gov.ph',       'Roberto Tan',        'Medical Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_rhu',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_carmen',   'carmen.villanueva@aloguinsan.gov.ph',  'Carmen Villanueva',  'Public Health Nurse',    NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_rhu',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_eduardo',  'eduardo.flores@aloguinsan.gov.ph',    'Eduardo Flores',     'Planning Officer',       NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_mpdo',        'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_rosario',  'rosario.mendoza@aloguinsan.gov.ph',   'Rosario Mendoza',    'Environment Officer',    NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_menro',       'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_antonio',  'antonio.ramos@aloguinsan.gov.ph',     'Antonio Ramos',      'Police Officer',         NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_pnp',         'AVAILABLE', 0, NOW(3), NOW(3)),
('srv_remedios', 'remedios.garcia@aloguinsan.gov.ph',   'Remedios Garcia',    'Revenue Officer',        NULL, '$2a$10$s8FBXP/nBHYP5q5aCuKWs.9CSq2ZGf8yP5nQ3j7yBTKG3VgtHjYTW', 'dept_treasurer',   'AVAILABLE', 0, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ─── Admin User ─────────────────────────────────────────────────────────────
-- Email: admin@aloguinsan.gov.ph  |  Password: admin123

INSERT INTO `users` (`id`, `email`, `phone`, `name`, `barangay`, `address`, `role`, `password`, `isVerified`, `language`, `createdAt`, `updatedAt`) VALUES
('usr_admin', 'admin@aloguinsan.gov.ph', NULL, 'System Administrator', 'Poblacion', NULL, 'ADMIN',
 '$2a$10$FycHWAKSb3QldIofm04.te.VYk77u8iTtFD96ZDm//1ferY005Lha',
 true, 'ENGLISH', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ─── Citizens / Residents (10 accounts) ─────────────────────────────────────
-- Password for all: resident123

INSERT INTO `users` (`id`, `email`, `phone`, `name`, `barangay`, `address`, `role`, `password`, `isVerified`, `language`, `createdAt`, `updatedAt`) VALUES
('usr_juan',       'juan.delacruz@example.com',     '09171234567', 'Juan Dela Cruz',     'Cabigohan',  'Purok 1, Cabigohan',      'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_maria_c',    'maria.clara@example.com',       '09181234568', 'Maria Clara Santos', 'Poblacion',  'Purok 3, Poblacion',      'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_pedro',      'pedro.penduko@example.com',     '09191234569', 'Pedro Penduko',      'Kantabogon', 'Sitio Lawis, Kantabogon', 'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_rosa',       'rosa.magtanggol@example.com',   '09201234570', 'Rosa Magtanggol',    'Lawaan',     'Purok 2, Lawaan',         'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_andres',     'andres.bonifacio@example.com',  '09211234571', 'Andres Bonifacio',   'Ta-al',      'Purok 5, Ta-al',          'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_gabriela',   'gabriela.silang@example.com',   '09221234572', 'Gabriela Silang',    'Compostela', 'Purok 1, Compostela',     'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_emilio',     'emilio.jacinto@example.com',    '09231234573', 'Emilio Jacinto',     'Punay',      'Sitio Centro, Punay',     'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_josefa',     'josefa.llanes@example.com',     '09241234574', 'Josefa Llanes',      'Rosario',    'Purok 4, Rosario',        'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_apolinario', 'apolinario.mabini@example.com', '09251234575', 'Apolinario Mabini',  'Dumlog',     'Purok 6, Dumlog',         'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3)),
('usr_tandang',    'tandang.sora@example.com',      '09261234576', 'Tandang Sora',       'San Vicente','Purok 2, San Vicente',    'CLIENT', '$2a$10$vIeNoXxrNzwkYilRRaGU8OcN3DRffMtzUW0d.lFjZ67iQvcblvyrS', true, 'ENGLISH', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ─── Mark migrations as applied ─────────────────────────────────────────────
-- This tells Prisma that migrations have already been applied via raw SQL.

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`, `finished_at`, `started_at`, `applied_steps_count`) VALUES
(UUID(), 'manual', '20260227051402_init', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227092144_add_announcements_directory', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227124337_add_escalation_feedback_audit_indexes', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227135500_fix_announcements_directory_schema', NOW(3), NOW(3), 1)
ON DUPLICATE KEY UPDATE `migration_name` = VALUES(`migration_name`);
