
-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetter" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "offset" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_key" ON "Notification"("eventId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

