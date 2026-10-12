import type { PrismaClient } from '@prisma/client';
import type { EventEnvelope, ShipmentEventPayload } from '../events/envelope.js';
import { render, renderForDriver } from './policy.js';

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
  const base = {
    eventId: env.eventId,
    shipmentId: env.payload.shipmentId,
    reference: env.payload.reference,
    eventType: env.eventType,
  };
  const data = [{ ...base, recipientId: env.payload.customerId, subject, body }];

  const forDriver = renderForDriver(env);
  if (forDriver && env.payload.driverUserId) {
    data.push({ ...base, recipientId: env.payload.driverUserId, ...forDriver });
  }

  const result = await db.notification.createMany({ data, skipDuplicates: true });
  return { queued: result.count > 0, duplicate: result.count === 0 };
}

export async function unreadCount(db: PrismaClient, recipientId: string): Promise<number> {
  return db.notification.count({ where: { recipientId, readAt: null } });
}

// Scoped by recipient in the WHERE, so marking someone else's id is a no-op
// rather than a permission check that could be forgotten.
export async function markRead(db: PrismaClient, recipientId: string, id: string): Promise<boolean> {
  const r = await db.notification.updateMany({
    where: { id, recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return r.count > 0;
}

export async function markAllRead(db: PrismaClient, recipientId: string): Promise<number> {
  const r = await db.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return r.count;
}

export async function listForRecipient(db: PrismaClient, recipientId: string, limit = 50, unreadOnly = false) {
  return db.notification.findMany({
    where: { recipientId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

export async function listForShipment(db: PrismaClient, shipmentId: string, recipientId?: string) {
  return db.notification.findMany({
    where: { shipmentId, ...(recipientId ? { recipientId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}
