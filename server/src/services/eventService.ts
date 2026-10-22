import prisma from '../db';
import { formatPrice } from '../utils/helpers';

export async function listEvents() {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
    include: {
      _count: { select: { seats: { where: { bookings: { some: { status: 'CONFIRMED' } } } } } },
    },
  });

  const now = new Date();
  return events.map((event) => {
    const totalSeats = event.rows * event.cols;
    return {
      id: event.id,
      title: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
      price: formatPrice(event.priceCents),
      priceCents: event.priceCents,
      totalSeats,
      seatsLeft: event.startsAt < now ? 0 : totalSeats - event._count.seats,
    };
  });
}

export async function getEventWithSeats(id: number) {
  return prisma.event.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true } },
      seats: {
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
        include: { bookings: { where: { status: 'CONFIRMED' } } },
      },
    },
  });
}
