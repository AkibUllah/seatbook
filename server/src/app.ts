import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import prisma from './db';
import { asyncHandler, errorHandler, notFound } from './errors';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import bookingRoutes from './routes/bookings';
import holdRoutes from './routes/holds';

export function createApp() {
  const app = express();

  // only behind a reverse proxy; otherwise clients could spoof X-Forwarded-For past the rate limit
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '20kb' }));

  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    })
  );

  app.use('/auth', authRoutes);
  app.use('/events', eventRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/holds', holdRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
