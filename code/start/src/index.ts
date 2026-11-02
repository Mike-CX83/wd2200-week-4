import 'dotenv/config';
import { createApp } from './app';

async function main() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const { app, logger } = await createApp({
    jwtSecret: process.env.JWT_SECRET ?? '',
    adminEmail: process.env.ADMIN_EMAIL ?? '',
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    corsOrigin: process.env.CORS_ORIGIN,
    logDirectory: process.env.LOG_DIR,
  });
  const server = app.listen(port, () => logger.info({ event: 'server_started', port }));
  server.on('error', () => { logger.error({ event: 'server_start_failed' }); process.exitCode = 1; });
  const shutdown = () => server.close(() => logger.end());
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed.'); process.exitCode = 1; });
