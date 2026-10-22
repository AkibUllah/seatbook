import { createApp } from './app';
import { config } from './config';
import prisma from './db';
import { expireStaleHolds } from './services/bookingService';

const server = createApp().listen(config.port, () => {
  console.log(`Seatbook API running on http://localhost:${config.port}`);
});

const sweeper = setInterval(() => {
  expireStaleHolds().catch((err) => console.error('Failed to expire holds', err));
}, 60_000);

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(sweeper);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
