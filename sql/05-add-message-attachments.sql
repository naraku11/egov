-- Add attachments column to ticket_messages table
-- Stores JSON array of file objects: [{ fileName, filePath, fileSize, mimeType }]
ALTER TABLE `ticket_messages` ADD COLUMN `attachments` TEXT NULL AFTER `message`;
