/*
  Warnings:

  - You are about to drop the column `createdBy` on the `announcements` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `feedbacks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "announcements" DROP COLUMN "createdBy",
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "directory_entries" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "feedbacks" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "servants" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationReason" TEXT;

-- CreateIndex
CREATE INDEX "announcements_isPublished_idx" ON "announcements"("isPublished");

-- CreateIndex
CREATE INDEX "announcements_category_idx" ON "announcements"("category");

-- CreateIndex
CREATE INDEX "attachments_ticketId_idx" ON "attachments"("ticketId");

-- CreateIndex
CREATE INDEX "directory_entries_category_idx" ON "directory_entries"("category");

-- CreateIndex
CREATE INDEX "directory_entries_isActive_idx" ON "directory_entries"("isActive");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "servants_departmentId_idx" ON "servants"("departmentId");

-- CreateIndex
CREATE INDEX "servants_status_idx" ON "servants"("status");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_isInternal_idx" ON "ticket_messages"("ticketId", "isInternal");

-- CreateIndex
CREATE INDEX "tickets_userId_idx" ON "tickets"("userId");

-- CreateIndex
CREATE INDEX "tickets_servantId_idx" ON "tickets"("servantId");

-- CreateIndex
CREATE INDEX "tickets_departmentId_idx" ON "tickets"("departmentId");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_priority_idx" ON "tickets"("priority");

-- CreateIndex
CREATE INDEX "tickets_slaDeadline_idx" ON "tickets"("slaDeadline");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
