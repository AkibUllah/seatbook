import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { formatPrice } from '../utils/helpers';
import { idParam, seatBody } from '../validation';

const router = Router();

router.use(requireAuth, requireRole('ATTENDEE'));

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res) => {
    const { seatId } = seatBody.parse(req.body);

    const seat = await prisma.seat.findUnique({
      where: { id: seatId },
      include: { event: true },
    });

    if (!seat) {
      throw new HttpError(404, 'Seat not found');
    }

    if (seat.event.startsAt <= new Date()) {
      throw new HttpError(409, 'This event has already started');
    }

    // No "is it free?" check first: two requests could both pass it. The
    // partial unique index on active bookings decides who gets the seat.
    let booking;
    try {
      booking = await prisma.booking.create({
        data: { seatId: seat.id, userId: req.user!.id, status: 'CONFIRMED' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new HttpError(409, 'Seat already booked');
      }
      throw err;
    }

    res.status(201).json(booking);
  })
);

router.get(
  '/mine',
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
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = idParam.parse(req.params);

    // scoped to the caller, so someone else's booking looks the same as a missing one
    const booking = await prisma.booking.findFirst({
      where: { id, userId: req.user!.id },
      include: { seat: { include: { event: true } } },
    });

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new HttpError(409, 'This booking is not active');
    }
    if (booking.seat.event.startsAt <= new Date()) {
      throw new HttpError(409, 'This event has already started');
    }

    const { count } = await prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (count === 0) {
      throw new HttpError(409, 'This booking is not active');
    }

    res.json({ id, status: 'CANCELLED' });
  })
);

export default router;
