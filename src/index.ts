import { buildApp, setReady, SERVICE_NAME } from './app.js';
import { startConsumer, stopConsumer } from './events/consumer.js';
import { startDispatcher, stopDispatcher, consoleSender } from './domain/dispatch.js';
import { prisma, pingDb } from './db/client.js';

const PORT = Number(process.env['PORT'] ?? 3005);
const app = buildApp();

async function main(): Promise<void> {
  await app.listen({ port: PORT, host: '0.0.0.0' });

  if (!(await pingDb())) {
    // Stay up but un-ready rather than crash-loop through a DB outage.
    app.log.error('database unreachable at startup; staying un-ready');
  }

  startDispatcher(prisma, consoleSender);

  try {
    await startConsumer();
    app.log.info('kafka consumer running');
  } catch (err) {
    app.log.error({ err }, 'kafka unavailable; no new notifications will queue');
  }

  setReady(true);
  app.log.info({ service: SERVICE_NAME, port: PORT }, 'service started');
}

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    // Fail readiness before closing so the pod leaves Service endpoints first.
    setReady(false);
    stopDispatcher();
    void (async () => {
      // Disconnect first so Kafka rebalances now, not after the session timeout.
      await stopConsumer();
      await app.close();
      process.exit(0);
    })();
  });
}

main().catch((err: unknown) => {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
});
