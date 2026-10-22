import { createApp } from './app';
import { config } from './config';
import prisma from './db';

const server = createApp().listen(config.port, () => {
  console.log(`Seatbook API running on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
