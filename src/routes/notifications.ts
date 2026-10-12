import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import {
  listForRecipient, listForShipment, unreadCount, markRead, markAllRead,
} from '../domain/notifications.js';
import { identity, hasRole, isStaff, requireRole } from '../authz.js';

// Who may read another person's inbox: support answering "did I get told?".
const CAN_READ_OTHERS = ['ADMIN', 'SUPPORT'] as const;

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // Your own inbox. recipientId is honoured only for ADMIN/SUPPORT; for
  // everyone else it is ignored rather than rejected, so an old client that
  // still sends its own id keeps working.
  app.get('/notifications', async (req) => {
    const id = identity(req);
    const { recipientId, limit, unread } = z.object({
      recipientId: z.string().min(1).optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
      unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    }).parse(req.query);
    const target = recipientId && hasRole(id, CAN_READ_OTHERS) ? recipientId : id.userId;
    return listForRecipient(prisma, target, limit, unread ?? false);
  });

  app.get('/notifications/unread-count', async (req) => {
    const id = identity(req);
    return { count: await unreadCount(prisma, id.userId) };
  });

  app.post('/notifications/read-all', async (req) => {
    const id = identity(req);
    return { updated: await markAllRead(prisma, id.userId) };
  });

  app.post('/notifications/:id/read', async (req, reply) => {
    const id = identity(req);
    const { id: notificationId } = z.object({ id: z.string().uuid() }).parse(req.params);
    await markRead(prisma, id.userId, notificationId);
    return reply.code(204).send();
  });

  // Staff see every message about a shipment; others only the ones sent to them.
  app.get('/notifications/shipment/:shipmentId', async (req) => {
    const id = identity(req);
    const { shipmentId } = z.object({ shipmentId: z.string().uuid() }).parse(req.params);
    return listForShipment(prisma, shipmentId, isStaff(id) ? undefined : id.userId);
  });

  app.get('/notifications/dead-letters', async (req) => {
    requireRole(identity(req), ['ADMIN']);
    return prisma.deadLetter.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  });
}
