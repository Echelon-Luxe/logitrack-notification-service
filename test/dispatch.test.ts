import { describe, it, expect, vi } from 'vitest';
import { dispatchPending, type Sender } from '../src/domain/dispatch.js';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n1', recipientId: 'cust-1', subject: 's', body: 'b',
  channel: 'EMAIL', attempts: 0, status: 'PENDING', ...over,
});

const makeDb = (pending: unknown[]) => {
  const update = vi.fn(async () => ({}));
  const db = {
    notification: {
      findMany: vi.fn(async () => pending),
      update,
      count: vi.fn(async () => 0),
    },
  } as never;
  return { db, update };
};

const okSender: Sender = { send: async () => {} };
const failSender: Sender = { send: () => { throw new Error('smtp refused'); } };

describe('dispatchPending', () => {
  it('marks a delivered notification SENT with a timestamp', async () => {
    const { db, update } = makeDb([row()]);
    const r = await dispatchPending(db, okSender);
    expect(r).toEqual({ sent: 1, failed: 0 });
    const data = update.mock.calls[0]![0] as { data: { status: string; sentAt: Date } };
    expect(data.data.status).toBe('SENT');
    expect(data.data.sentAt).toBeInstanceOf(Date);
  });

  // The key retry behaviour: a transient provider failure must stay PENDING.
  it('keeps a notification PENDING after an early failure', async () => {
    const { db, update } = makeDb([row({ attempts: 0 })]);
    const r = await dispatchPending(db, failSender);
    expect(r).toEqual({ sent: 0, failed: 1 });
    const data = update.mock.calls[0]![0] as { data: { status: string; attempts: number } };
    expect(data.data.status).toBe('PENDING');
    expect(data.data.attempts).toBe(1);
  });

  it('gives up and marks FAILED only at the attempt cap', async () => {
    const { db, update } = makeDb([row({ attempts: 4 })]);
    await dispatchPending(db, failSender);
    const data = update.mock.calls[0]![0] as { data: { status: string; attempts: number } };
    expect(data.data.status).toBe('FAILED');
    expect(data.data.attempts).toBe(5);
  });

  it('records the provider error for diagnosis', async () => {
    const { db, update } = makeDb([row()]);
    await dispatchPending(db, failSender);
    const data = update.mock.calls[0]![0] as { data: { lastError: string } };
    expect(data.data.lastError).toBe('smtp refused');
  });

  // One bad recipient must not stop the rest of the batch.
  it('continues the batch after one failure', async () => {
    const { db } = makeDb([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    let calls = 0;
    const flaky: Sender = {
      send: async () => { calls += 1; if (calls === 2) throw new Error('nope'); },
    };
    const r = await dispatchPending(db, flaky);
    expect(r).toEqual({ sent: 2, failed: 1 });
  });

  it('does nothing when there is no backlog', async () => {
    const { db, update } = makeDb([]);
    expect(await dispatchPending(db, okSender)).toEqual({ sent: 0, failed: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('only selects rows below the attempt cap', async () => {
    const { db } = makeDb([]);
    await dispatchPending(db, okSender);
    const where = (db as unknown as { notification: { findMany: { mock: { calls: Array<[{ where: unknown }]> } } } })
      .notification.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: 'PENDING', attempts: { lt: 5 } });
  });
});
