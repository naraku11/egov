-- Fix schema mismatch from migration 20260227092144_add_announcements_directory
-- The original migration had incorrect column names and missing columns.

-- ─── Fix "announcements" table ────────────────────────────────────────────────

-- Add missing publishedAt column
ALTER TABLE "announcements" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Add createdById (the correctly-named FK column)
ALTER TABLE "announcements" ADD COLUMN "createdById" TEXT;

-- Copy existing data to the new column
UPDATE "announcements" SET "createdById" = "createdBy";

-- Drop the old wrongly-named column
ALTER TABLE "announcements" DROP COLUMN "createdBy";

-- Add foreign key constraint to users table
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Fix "directory_entries" table ────────────────────────────────────────────

-- Add missing address column
ALTER TABLE "directory_entries" ADD COLUMN "address" TEXT;

-- ─── Create indexes (missing from original migration) ─────────────────────────

CREATE INDEX "announcements_isPublished_idx" ON "announcements"("isPublished");
CREATE INDEX "announcements_category_idx" ON "announcements"("category");
CREATE INDEX "directory_entries_category_idx" ON "directory_entries"("category");
CREATE INDEX "directory_entries_isActive_idx" ON "directory_entries"("isActive");
