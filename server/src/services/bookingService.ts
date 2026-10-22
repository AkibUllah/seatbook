import { Prisma } from '@prisma/client';
import prisma from '../db';
import { config } from '../config';
import { HttpError } from '../errors';

// A seat is taken while it has a confirmed booking or a hold that hasn't lapsed.
// Expiry is decided here at read time, so a late sweep never keeps a seat off sale.
export function activeBookingWhere(now: Date): Prisma.BookingWhereInput {
  return { OR: [{ status: 'CONFIRMED' }, { status: 'HELD', expiresAt: { gt: now } }] };
}

function prismaCode(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
}

// Hold a seat for config.holdMinutes, or book it outright.
export async function claimSeat(userId: number, seatId: number, status: 'HELD' | 'CONFIRMED') {
  const now = new Date();

  // Cheap early answer for the common case when a popular event opens: most
  // requests are for seats already taken, and they shouldn't each need a
  // transaction and a pooled connection. The transaction below re-checks.
  const takenNow = await prisma.booking.findFirst({ where: { seatId, ...activeBookingWhere(now) } });
  if (takenNow && takenNow.userId !== userId) {
    throw new HttpError(409, 'Sorry, this seat is taken');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise one user's claims so parallel requests can't slip past the hold limit.
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (locked.length === 0) {
        // a valid token for an account that no longer exists
        throw new HttpError(401, 'Please log in again');
      }

      const seat = await tx.seat.findUnique({ where: { id: seatId }, include: { event: true } });
      if (!seat) {
        throw new HttpError(404, 'Seat not found');
      }
      if (seat.event.startsAt <= now) {
        throw new HttpError(409, 'This event has already started');
      }

      const taken = await tx.booking.findFirst({ where: { seatId, ...activeBookingWhere(now) } });
      if (taken?.userId === userId) {
        throw new HttpError(409, taken.status === 'HELD' ? 'You are already holding this seat' : 'You already booked this seat');
      }
      if (taken) {
        throw new HttpError(409, 'Sorry, this seat is taken');
      }

      if (status === 'HELD') {
        const holds = await tx.booking.count({
          where: { userId, status: 'HELD', expiresAt: { gt: now }, seat: { eventId: seat.eventId } },
        });
        if (holds >= config.maxHoldsPerEvent) {
          throw new HttpError(409, `You can hold up to ${config.maxHoldsPerEvent} seats at a time for an event`);
        }
      }

      // A lapsed hold is still HELD until marked expired, and the unique index
      // still counts it, so retire it before taking the seat.
      await tx.booking.updateMany({
        where: { seatId, status: 'HELD', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });

      return tx.booking.create({
        data: {
          seatId,
          userId,
          status,
          expiresAt: status === 'HELD' ? new Date(now.getTime() + config.holdMinutes * 60_000) : null,
        },
        include: { seat: true },
      });
    }, { maxWait: 10_000, timeout: 10_000 });
  } catch (err) {
    // someone else claimed the seat between our check and our insert
    if (prismaCode(err) === 'P2002') {
      throw new HttpError(409, 'Sorry, this seat is taken');
    }
    // every pooled connection stayed busy for maxWait
    if (prismaCode(err) === 'P2028') {
      throw new HttpError(503, 'We are very busy right now, please try again');
    }
    throw err;
  }
}

export async function confirmHold(userId: number, holdId: number) {
  const now = new Date();

  // One conditional update: it can't interleave with expiry or a release.
  const { count } = await prisma.booking.updateMany({
    where: {
      id: holdId,
      userId,
      status: 'HELD',
      expiresAt: { gt: now },
      seat: { event: { startsAt: { gt: now } } },
    },
    data: { status: 'CONFIRMED', expiresAt: null },
  });

  const booking = await prisma.booking.findFirst({
    where: { id: holdId, userId },
    include: { seat: { include: { event: true } } },
  });

  if (count === 1 || booking?.status === 'CONFIRMED') {
    // a repeated confirm (double click, retry) gets the same answer
    return booking!;
  }
  if (!booking) {
    throw new HttpError(404, 'Hold not found');
  }
  if (booking.status === 'RELEASED') {
    throw new HttpError(409, 'This hold was released');
  }
  if (booking.status === 'CANCELLED') {
    throw new HttpError(409, 'This booking was cancelled');
  }
  if (booking.seat.event.startsAt <= now) {
    throw new HttpError(409, 'This event has already started');
  }
  throw new HttpError(410, 'Your hold expired and the seat went back on sale');
}

export async function releaseHold(userId: number, holdId: number) {
  const { count } = await prisma.booking.updateMany({
    where: { id: holdId, userId, status: 'HELD' },
    data: { status: 'RELEASED', cancelledAt: new Date() },
  });
  if (count === 0) {
    throw new HttpError(404, 'Hold not found');
  }
}

// Housekeeping only: reads already treat lapsed holds as free.
export async function expireStaleHolds() {
  const { count } = await prisma.booking.updateMany({
    where: { status: 'HELD', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return count;
}
