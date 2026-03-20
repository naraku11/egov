-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('INFO', 'ALERT', 'EVENT');

-- CreateEnum
CREATE TYPE "DirectoryCategory" AS ENUM ('OFFICIAL', 'EMERGENCY', 'SERVICE');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "AnnouncementCategory" NOT NULL DEFAULT 'INFO',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_entries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "officeHours" TEXT,
    "category" "DirectoryCategory" NOT NULL DEFAULT 'OFFICIAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directory_entries_pkey" PRIMARY KEY ("id")
);
