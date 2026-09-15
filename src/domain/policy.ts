import type { EventEnvelope, ShipmentEventPayload } from '../events/envelope.js';

// Not every event is worth an email. shipment.in_transit fires repeatedly on a
// long route, and picked_up is immediately followed by in_transit - notifying
// on both trains customers to ignore the channel.
const NOTIFIABLE = new Set([
  'shipment.created',
  'shipment.assigned',
  'shipment.out_for_delivery',
  'shipment.delivered',
  'shipment.cancelled',
]);

export const shouldNotify = (eventType: string): boolean => NOTIFIABLE.has(eventType);

export interface RenderedMessage {
  subject: string;
  body: string;
}

const TEMPLATES: Record<string, (p: ShipmentEventPayload) => RenderedMessage> = {
  'shipment.created': (p) => ({
    subject: `Shipment ${p.reference} created`,
    body: `Your shipment from ${p.origin} to ${p.destination} has been created. Reference ${p.reference}.`,
  }),
  'shipment.assigned': (p) => ({
    subject: `Shipment ${p.reference} assigned to a driver`,
    body: `A driver has been assigned to your shipment ${p.reference}.`,
  }),
  'shipment.out_for_delivery': (p) => ({
    subject: `Shipment ${p.reference} is out for delivery`,
    body: `Your shipment ${p.reference} is out for delivery to ${p.destination}.`,
  }),
  'shipment.delivered': (p) => ({
    subject: `Shipment ${p.reference} delivered`,
    body: `Your shipment ${p.reference} was delivered to ${p.destination}.`,
  }),
  'shipment.cancelled': (p) => ({
    subject: `Shipment ${p.reference} cancelled`,
    body: `Your shipment ${p.reference} has been cancelled.`,
  }),
};

export function render(env: EventEnvelope<ShipmentEventPayload>): RenderedMessage {
  const template = TEMPLATES[env.eventType];
  // Falls back rather than throwing: an unknown-but-notifiable event should
  // still reach the customer, not dead-letter.
  if (!template) {
    return {
      subject: `Update on shipment ${env.payload.reference}`,
      body: `Your shipment ${env.payload.reference} is now ${env.payload.status}.`,
    };
  }
  return template(env.payload);
}
