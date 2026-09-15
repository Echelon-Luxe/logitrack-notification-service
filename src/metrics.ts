import { Registry, collectDefaultMetrics, Counter, Gauge } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'logitrack-notification-service' });
collectDefaultMetrics({ register: registry });

export const notificationsQueued = new Counter({
  name: 'notifications_queued_total',
  help: 'Notifications created from events',
  labelNames: ['event_type'] as const,
  registers: [registry],
});

export const notificationsSkipped = new Counter({
  name: 'notifications_skipped_total',
  help: 'Events consumed but deliberately not notified',
  labelNames: ['event_type'] as const,
  registers: [registry],
});

export const notificationsDuplicate = new Counter({
  name: 'notifications_duplicate_total',
  help: 'Events skipped because the eventId was already handled',
  labelNames: ['event_type'] as const,
  registers: [registry],
});

export const notificationsSent = new Counter({
  name: 'notifications_sent_total',
  help: 'Notifications dispatched',
  labelNames: ['channel'] as const,
  registers: [registry],
});

export const notificationsFailed = new Counter({
  name: 'notifications_failed_total',
  help: 'Notification dispatch failures',
  labelNames: ['channel'] as const,
  registers: [registry],
});

export const pendingBacklog = new Gauge({
  name: 'notifications_pending',
  help: 'Notifications awaiting dispatch',
  registers: [registry],
});

export const eventsDeadLettered = new Counter({
  name: 'notification_events_dead_lettered_total',
  help: 'Events parked in the dead-letter table',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const consumerLag = new Gauge({
  name: 'notification_consumer_lag_seconds',
  help: 'Seconds between event occurrence and processing',
  labelNames: ['topic'] as const,
  registers: [registry],
});

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});
