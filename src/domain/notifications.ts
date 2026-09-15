import type { PrismaClient } from '@prisma/client';
import type { EventEnvelope, ShipmentEventPayload } from '../events/envelope.js';
import { render } from './policy.js';

export interface QueueResult {
  queued: boolean;
  duplicate: boolean;
}

// Dedup via the unique constraint on eventId, not read-then-insert: the latter
// races, letting two consumers both see "absent" and both insert.
export async function queueNotification(
  db: PrismaClient,
  env: EventEnvelope<ShipmentEventPayload>,
): Promise<QueueResult> {
  const { subject, body } = render(env);
  const result = await db.notification.createMany({
    data: [{
      eventId: env.eventId,
      shipmentId: env.payload.shipmentId,
      reference: env.payload.reference,
      recipientId: env.payload.customerId,
      eventType: env.eventType,
      subject,
      body,
    }],
    skipDuplicates: true,
  });
  return { queued: result.count === 1, duplicate: result.count === 0 };
}

export async function listForRecipient(db: PrismaClient, recipientId: string, limit = 50) {
  return db.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

export async function listForShipment(db: PrismaClient, shipmentId: string) {
  return db.notification.findMany({
    where: { shipmentId },
    orderBy: { createdAt: 'asc' },
  });
}
