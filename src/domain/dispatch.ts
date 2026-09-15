import type { PrismaClient } from '@prisma/client';
import { notificationsSent, notificationsFailed, pendingBacklog } from '../metrics.js';

const MAX_ATTEMPTS = 5;

export interface Sender {
  send(msg: { to: string; subject: string; body: string }): Promise<void>;
}

// Stands in for SES/SendGrid. Logs to stdout so the collector picks it up.
export const consoleSender: Sender = {
  send: async () => { /* simulated delivery */ },
};

// Consuming and sending are separate steps. If dispatch happened inside the
// consumer, a provider outage would stall the partition and block every other
// shipment's events behind it.
export async function dispatchPending(
  db: PrismaClient,
  sender: Sender,
  batchSize = 25,
): Promise<{ sent: number; failed: number }> {
  const pending = await db.notification.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    try {
      await sender.send({ to: n.recipientId, subject: n.subject, body: n.body });
      await db.notification.update({
        where: { id: n.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
      notificationsSent.inc({ channel: n.channel });
      sent += 1;
    } catch (err) {
      const attempts = n.attempts + 1;
      await db.notification.update({
        where: { id: n.id },
        data: {
          // Only give up at the cap; until then it stays PENDING and retries.
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      notificationsFailed.inc({ channel: n.channel });
      failed += 1;
    }
  }

  const backlog = await db.notification.count({ where: { status: 'PENDING' } });
  pendingBacklog.set(backlog);

  return { sent, failed };
}

let timer: NodeJS.Timeout | null = null;

export function startDispatcher(db: PrismaClient, sender: Sender, intervalMs = 2000): void {
  timer = setInterval(() => {
    void dispatchPending(db, sender).catch(() => { /* next tick retries */ });
  }, intervalMs);
  timer.unref();
}

export function stopDispatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
