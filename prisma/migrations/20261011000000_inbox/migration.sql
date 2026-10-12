-- One event can now address several recipients (customer + driver).
DROP INDEX IF EXISTS "Notification_eventId_key";
CREATE UNIQUE INDEX "Notification_eventId_recipientId_key" ON "Notification"("eventId", "recipientId");

ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");
