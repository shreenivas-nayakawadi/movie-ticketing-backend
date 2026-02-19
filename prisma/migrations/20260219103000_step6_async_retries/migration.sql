-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT;

-- AlterTable
ALTER TABLE "RefundJob"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_createdAt_idx"
ON "Notification"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "RefundJob_status_nextAttemptAt_createdAt_idx"
ON "RefundJob"("status", "nextAttemptAt", "createdAt");
