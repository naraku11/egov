-- Migration: Add idStatus column to User table for admin ID review workflow
-- Run after: 07-add-user-id-photo.sql

ALTER TABLE `users`
  ADD COLUMN `idStatus` ENUM('VERIFIED', 'PENDING_REVIEW', 'REJECTED', 'NONE') NOT NULL DEFAULT 'NONE'
  AFTER `idPhotoUrl`;

-- Backfill: mark existing users who have an ID photo as PENDING_REVIEW
UPDATE `users` SET `idStatus` = 'PENDING_REVIEW' WHERE `idPhotoUrl` IS NOT NULL AND `idStatus` = 'NONE';
