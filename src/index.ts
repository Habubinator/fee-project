import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { startWorkers } from './jobs';

async function main(): Promise<void> {
  await prisma.$connect();
  console.log('[db] connected');

  await redis.ping();
  console.log('[redis] connected');

  startWorkers();

  app.listen(config.PORT, () => {
    console.log(`[api] listening on port ${config.PORT} (${config.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('[startup] fatal error:', err);
  process.exit(1);
});
