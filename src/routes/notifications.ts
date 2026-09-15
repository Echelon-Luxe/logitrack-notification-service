import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { listForRecipient, listForShipment } from '../domain/notifications.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', async (req) => {
    const { recipientId, limit } = z.object({
      recipientId: z.string().min(1),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }).parse(req.query);
    return listForRecipient(prisma, recipientId, limit);
  });

  app.get('/notifications/shipment/:shipmentId', async (req) => {
    const { shipmentId } = z.object({ shipmentId: z.string().uuid() }).parse(req.params);
    return listForShipment(prisma, shipmentId);
  });

  app.get('/notifications/dead-letters', async () => {
    return prisma.deadLetter.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  });
}
