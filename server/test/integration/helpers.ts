import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import prisma from '../../src/db';
import { signToken } from '../../src/middleware/auth';
import { seatLabel } from '../../src/utils/helpers';

export const app = createApp();
export const api = () => request(app);

const passwordHash = bcrypt.hashSync('password123', 4);

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "Booking", "Seat", "Event", "User" RESTART IDENTITY CASCADE');
}

let userCount = 0;

export async function createUser(role: 'ORGANIZER' | 'ATTENDEE' = 'ATTENDEE') {
  userCount++;
  const user = await prisma.user.create({
    data: { email: `user${userCount}@test.local`, name: `User ${userCount}`, passwordHash, role },
  });
  const token = signToken(user);
  return { ...user, token, auth: `Bearer ${token}` };
}

export async function createEvent({ rows = 2, cols = 5, startsInHours = 24 } = {}) {
  const organizer = await createUser('ORGANIZER');
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seats.push({ row: r, col: c, label: seatLabel(r, c) });
    }
  }
  return prisma.event.create({
    data: {
      title: 'Test event',
      description: '',
      venue: 'Test hall',
      startsAt: new Date(Date.now() + startsInHours * 3600_000),
      rows,
      cols,
      priceCents: 1500,
      organizerId: organizer.id,
      seats: { create: seats },
    },
    include: { seats: { orderBy: { id: 'asc' } } },
  });
}

// What 10 minutes passing looks like to the server.
export async function expireHold(holdId: number) {
  await prisma.booking.update({ where: { id: holdId }, data: { expiresAt: new Date(Date.now() - 1000) } });
}

export async function activeBookingsForSeat(seatId: number) {
  return prisma.booking.count({ where: { seatId, status: { in: ['HELD', 'CONFIRMED'] } } });
}
