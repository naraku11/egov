-- =============================================================================
-- E-Government Assistance System — Municipality of Aluguinsan, Cebu
-- FILE 1: Database Schema (run this FIRST)
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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

-- ─── Departments (required before servants) ─────────────────────────────────

INSERT INTO `departments` (`id`, `name`, `code`, `description`, `head`, `email`, `phone`, `color`, `icon`, `keywords`, `isActive`, `createdAt`, `updatedAt`) VALUES
('dept_mayors',      'Mayor''s Office',               'MAYORS',      'General inquiries, official documents, and barangay coordination',     'Hon. Mayor',                'mayor@aluguinsan.gov.ph',       '032-000-0001', '#1D4ED8', 'star',        '["mayor","general inquiry","document","certificate","barangay","coordination","permit","endorsement","clearance"]',                                           true, NOW(3), NOW(3)),
('dept_engineering', 'Municipal Engineering Office',   'ENGINEERING', 'Road damage, flood control, and infrastructure requests',              'Municipal Engineer',        'engineering@aluguinsan.gov.ph',  '032-000-0002', '#D97706', 'wrench',      '["road","flood","infrastructure","bridge","drainage","pothole","construction","repair","building","structure","engineering"]',                                  true, NOW(3), NOW(3)),
('dept_mswdo',       'MSWDO',                         'MSWDO',       'Social welfare, PWD assistance, and senior citizen benefits',           'MSWDO Head',                'mswdo@aluguinsan.gov.ph',        '032-000-0003', '#059669', 'heart',       '["social","welfare","pwd","disability","senior","citizen","elderly","indigent","solo parent","child","family","assistance","benefit","4ps"]',                   true, NOW(3), NOW(3)),
('dept_rhu',         'Rural Health Unit',              'RHU',         'Health programs, medical certificates, and immunization',               'Municipal Health Officer',  'rhu@aluguinsan.gov.ph',          '032-000-0004', '#DC2626', 'heart-pulse', '["health","medical","hospital","medicine","immunization","vaccine","doctor","nurse","certificate","sick","disease","sanitation","nutrition"]',                  true, NOW(3), NOW(3)),
('dept_mpdo',        'MPDO',                           'MPDO',        'Land use, business permits, and development plans',                    'Municipal Planning Officer','mpdo@aluguinsan.gov.ph',         '032-000-0005', '#7C3AED', 'map',         '["land","business","permit","zoning","development","plan","subdivision","lot","property","commercial","enterprise","livelihood"]',                              true, NOW(3), NOW(3)),
('dept_menro',       'MENRO',                          'MENRO',       'Environmental complaints, illegal logging, and waste management',       'MENRO Head',                'menro@aluguinsan.gov.ph',        '032-000-0006', '#16A34A', 'leaf',        '["environment","logging","waste","garbage","pollution","mining","tree","forest","river","fishery","quarry","dump","trash","littering"]',                        true, NOW(3), NOW(3)),
('dept_pnp',         'Philippine National Police',     'PNP',         'Peace and order, criminal reports, and community safety',               'Chief of Police',           'pnp@aluguinsan.gov.ph',          '032-000-0007', '#1E40AF', 'shield',      '["police","crime","theft","robbery","violence","safety","security","blotter","complaint","illegal","drugs","threat","assault"]',                                true, NOW(3), NOW(3)),
('dept_treasurer',   'Treasurer''s Office',            'TREASURER',   'Tax clearance, payment inquiries, and business tax',                    'Municipal Treasurer',       'treasurer@aluguinsan.gov.ph',    '032-000-0008', '#B45309', 'banknote',    '["tax","payment","clearance","receipt","real property","business tax","assessment","fees","fine","cashier","treasury"]',                                        true, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ─── Mark migrations as applied ─────────────────────────────────────────────

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`, `finished_at`, `started_at`, `applied_steps_count`) VALUES
(UUID(), 'manual', '20260227051402_init', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227092144_add_announcements_directory', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227124337_add_escalation_feedback_audit_indexes', NOW(3), NOW(3), 1),
(UUID(), 'manual', '20260227135500_fix_announcements_directory_schema', NOW(3), NOW(3), 1)
ON DUPLICATE KEY UPDATE `migration_name` = VALUES(`migration_name`);
