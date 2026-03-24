-- Add idPhotoUrl column to users table for citizen ID verification
ALTER TABLE users ADD COLUMN idPhotoUrl VARCHAR(191) NULL AFTER avatarUrl;
