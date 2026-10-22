import { Router } from 'express';
import prisma from '../db';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getEventWithSeats, listEvents } from '../services/eventService';
import { formatPrice, seatLabel } from '../utils/helpers';
import { createEventBody, idParam } from '../validation';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listEvents());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = idParam.safeParse(req.params);
    const event = parsed.success ? await getEventWithSeats(parsed.data.id) : null;

    if (!event) {
      throw new HttpError(404, 'Event not found');
    }

    const seats = event.seats.map((seat) => ({
      id: seat.id,
      row: seat.row,
      col: seat.col,
      label: seat.label,
      available: seat.bookings.length === 0,
    }));

    res.json({
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: event.startsAt,
      price: formatPrice(event.priceCents),
      priceCents: event.priceCents,
      rows: event.rows,
      cols: event.cols,
      organizer: event.organizer,
      seats,
    });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole('ORGANIZER'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { title, description, venue, startsAt, rows, cols, priceCents } = createEventBody.parse(req.body);

    const seats = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        seats.push({ row: r, col: c, label: seatLabel(r, c) });
      }
    }

    const event = await prisma.event.create({
      data: {
        title,
        description,
        venue,
        startsAt,
        rows,
        cols,
        priceCents,
        organizerId: req.user!.id,
        seats: { create: seats },
      },
    });

    res.status(201).json(event);
  })
);

export default router;
