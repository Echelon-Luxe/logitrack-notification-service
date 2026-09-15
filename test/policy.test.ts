import { describe, it, expect } from 'vitest';
import { shouldNotify, render } from '../src/domain/policy.js';
import type { EventEnvelope, ShipmentEventPayload } from '../src/events/envelope.js';

const env = (eventType: string, over: Partial<ShipmentEventPayload> = {}) => ({
  eventId: 'e', eventType, eventVersion: 1,
  occurredAt: '2026-09-15T10:00:00.000Z', traceId: 't', producer: 'p',
  payload: {
    shipmentId: 's', reference: 'LT-ABC123', status: 'DELIVERED',
    customerId: 'cust-1', driverId: null, origin: 'London', destination: 'Manchester',
    ...over,
  },
}) as EventEnvelope<ShipmentEventPayload>;

describe('shouldNotify', () => {
  it.each([
    'shipment.created',
    'shipment.assigned',
    'shipment.out_for_delivery',
    'shipment.delivered',
    'shipment.cancelled',
  ])('notifies on %s', (t) => expect(shouldNotify(t)).toBe(true));

  // in_transit fires repeatedly on a long route and picked_up is immediately
  // followed by in_transit; notifying on both trains customers to ignore email.
  it.each(['shipment.picked_up', 'shipment.in_transit'])(
    'stays quiet on %s', (t) => expect(shouldNotify(t)).toBe(false));

  it('ignores events belonging to other services', () => {
    expect(shouldNotify('driver.updated')).toBe(false);
    expect(shouldNotify('')).toBe(false);
  });
});

describe('render', () => {
  it('puts the reference in the subject so replies are traceable', () => {
    expect(render(env('shipment.delivered')).subject).toContain('LT-ABC123');
  });

  it('includes the destination for a delivery', () => {
    expect(render(env('shipment.delivered')).body).toContain('Manchester');
  });

  it('includes both endpoints on creation', () => {
    const m = render(env('shipment.created'));
    expect(m.body).toContain('London');
    expect(m.body).toContain('Manchester');
  });

  // An unknown event that policy allowed through should still reach the
  // customer rather than dead-letter.
  it('falls back to a generic message for an unknown event type', () => {
    const m = render(env('shipment.something_new', { status: 'SOMETHING_NEW' }));
    expect(m.subject).toContain('LT-ABC123');
    expect(m.body).toContain('SOMETHING_NEW');
  });

  it('never renders an empty subject or body', () => {
    for (const t of ['shipment.created', 'shipment.assigned', 'shipment.out_for_delivery',
                     'shipment.delivered', 'shipment.cancelled', 'shipment.unknown']) {
      const m = render(env(t));
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
    }
  });
});
