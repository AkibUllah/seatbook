import { z } from 'zod';

export const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

export const registerBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // bcrypt only looks at the first 72 bytes
  password: z.string().min(8, 'must be at least 8 characters').max(72),
  name: z.string().trim().min(1).max(100),
  role: z.enum(['ORGANIZER', 'ATTENDEE']).default('ATTENDEE'),
});

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const createEventBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  venue: z.string().trim().min(1).max(200),
  startsAt: z.coerce
    .date()
    .refine((d) => d > new Date(), 'must be in the future'),
  rows: z.number().int().min(1).max(26),
  cols: z.number().int().min(1).max(30),
  priceCents: z.number().int().min(0).max(100_000_000).default(0),
});

export const seatBody = z.object({
  seatId: z.coerce.number().int().positive(),
});
