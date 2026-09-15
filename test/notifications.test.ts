import { describe, it, expect, vi } from 'vitest';
import { queueNotification } from '../src/domain/notifications.js';
import type { EventEnvelope, ShipmentEventPayload } from '../src/events/envelope.js';

const env = (over: Record<string, unknown> = {}) => ({
  eventId: 'evt-1', eventType: 'shipment.delivered', eventVersion: 1,
  occurredAt: '2026-09-15T10:00:00.000Z', traceId: 't', producer: 'p',
  payload: {
    shipmentId: 'ship-1', reference: 'LT-ABC123', status: 'DELIVERED',
    customerId: 'cust-1', driverId: null, origin: 'London', destination: 'Manchester',
  },
  ...over,
}) as EventEnvelope<ShipmentEventPayload>;

const withDb = (impl: () => unknown) => {
  const createMany = vi.fn(impl);
  return { db: { notification: { createMany } } as never, createMany };
};

describe('queueNotification', () => {
  it('queues a first-time event', async () => {
    const { db } = withDb(() => ({ count: 1 }));
    expect(await queueNotification(db, env())).toEqual({ queued: true, duplicate: false });
  });

  it('treats a redelivered event as a duplicate, not an error', async () => {
    const { db } = withDb(() => ({ count: 0 }));
    expect(await queueNotification(db, env())).toEqual({ queued: false, duplicate: true });
  });

  // Without this the customer gets the same email twice after a rebalance.
  it('delegates deduplication to the database', async () => {
    const { db, createMany } = withDb(() => ({ count: 1 }));
    await queueNotification(db, env());
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('addresses the notification to the customer, not the driver', async () => {
    const { db, createMany } = withDb(() => ({ count: 1 }));
    await queueNotification(db, env());
    const arg = createMany.mock.calls[0]![0] as { data: Array<{ recipientId: string }> };
    expect(arg.data[0]!.recipientId).toBe('cust-1');
  });

  it('stores a rendered subject and body, not a template reference', async () => {
    const { db, createMany } = withDb(() => ({ count: 1 }));
    await queueNotification(db, env());
    const arg = createMany.mock.calls[0]![0] as { data: Array<{ subject: string; body: string }> };
    expect(arg.data[0]!.subject).toContain('LT-ABC123');
    expect(arg.data[0]!.body).toContain('Manchester');
  });

  it('propagates database errors so kafkajs retries without committing', async () => {
    const { db } = withDb(() => { throw new Error('connection terminated'); });
    let thrown: unknown;
    try { await queueNotification(db, env()); } catch (e) { thrown = e; }
    expect((thrown as Error).message).toBe('connection terminated');
  });
});
