import { Router } from 'express';
import prisma from '../db';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { formatPrice } from '../utils/helpers';
import { idParam, seatBody } from '../validation';

const router = Router();

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { seatId } = seatBody.parse(req.body);

    const seat = await prisma.seat.findUnique({
      where: { id: seatId },
      include: { event: true },
    });

    if (!seat) {
      throw new HttpError(404, 'Seat not found');
    }

    if (seat.event.startsAt < new Date()) {
      throw new HttpError(400, 'This event has already started');
    }

    const existing = await prisma.booking.findFirst({
      where: { seatId: seat.id, status: 'CONFIRMED' },
    });

    if (existing) {
      throw new HttpError(409, 'Seat already booked');
    }

    const booking = await prisma.booking.create({
      data: {
        seatId: seat.id,
        userId: req.user!.id,
        status: 'CONFIRMED',
      },
    });

    res.status(201).json(booking);
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { seat: { include: { event: true } } },
    });

    res.json(
      bookings.map((b) => ({
        id: b.id,
        status: b.status,
        createdAt: b.createdAt,
        seat: b.seat.label,
        event: {
          id: b.seat.event.id,
          title: b.seat.event.title,
          venue: b.seat.event.venue,
          startsAt: b.seat.event.startsAt,
          price: formatPrice(b.seat.event.priceCents),
          priceCents: b.seat.event.priceCents,
        },
      }))
    );
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = idParam.parse(req.params);

    await prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    res.json({ success: true });
  })
);

export default router;
