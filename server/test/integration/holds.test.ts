import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/db';
import { expireStaleHolds } from '../../src/services/bookingService';
import { activeBookingsForSeat, api, createEvent, createUser, expireHold, resetDb } from './helpers';

beforeEach(resetDb);

async function hold(user: { auth: string }, seatId: number) {
  return api().post('/holds').set('Authorization', user.auth).send({ seatId });
}

describe('holding a seat', () => {
  it('holds a seat for 10 minutes', async () => {
    const event = await createEvent();
    const alice = await createUser();

    const before = Date.now();
    const res = await hold(alice, event.seats[0].id);

    expect(res.status).toBe(201);
    const msLeft = new Date(res.body.expiresAt).getTime() - before;
    expect(msLeft).toBeGreaterThan(9.9 * 60_000);
    expect(msLeft).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  it('ends the hold when the event starts, if that comes first', async () => {
    const event = await createEvent({ startsInHours: 3 / 60 });
    const alice = await createUser();

    const res = await hold(alice, event.seats[0].id);

    expect(res.status).toBe(201);
    expect(new Date(res.body.expiresAt).getTime()).toBe(event.startsAt.getTime());
  });

  it('blocks everyone else from holding or booking the seat', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const seatId = event.seats[0].id;
    await hold(alice, seatId);

    expect((await hold(bob, seatId)).status).toBe(409);
    expect((await api().post('/bookings').set('Authorization', bob.auth).send({ seatId })).status).toBe(409);
  });

  it('gives a seat to exactly one of many concurrent holders', async () => {
    const event = await createEvent();
    const seatId = event.seats[0].id;
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser()));

    const results = await Promise.all(users.map((u) => hold(u, seatId)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    expect(await activeBookingsForSeat(seatId)).toBe(1);
  });

  it('caps holds at 4 per event, even when requested in parallel', async () => {
    const event = await createEvent({ rows: 2, cols: 5 });
    const alice = await createUser();

    const results = await Promise.all(event.seats.map((s) => hold(alice, s.id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(4);
    expect(results.filter((r) => r.status === 409)).toHaveLength(6);
  });

  it('sends a token for a deleted account back to login', async () => {
    const event = await createEvent();
    const ghost = await createUser();
    await prisma.user.delete({ where: { id: ghost.id } });

    expect((await hold(ghost, event.seats[0].id)).status).toBe(401);
  });

  it('shows the seat as held to others without saying by whom', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const seatId = event.seats[0].id;
    await hold(alice, seatId);

    const asAlice = await api().get(`/events/${event.id}`).set('Authorization', alice.auth);
    const asBob = await api().get(`/events/${event.id}`).set('Authorization', bob.auth);

    expect(asAlice.body.seats[0]).toMatchObject({ status: 'held', mine: true, available: false });
    expect(asAlice.body.myHolds).toHaveLength(1);
    expect(asBob.body.seats[0]).toMatchObject({ status: 'held', mine: false, available: false });
    expect(asBob.body.myHolds).toHaveLength(0);
  });
});

describe('confirming a hold', () => {
  it('turns the hold into a booking', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);

    const res = await api().post(`/holds/${h.body.id}/confirm`).set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
    const mine = await api().get('/bookings/mine').set('Authorization', alice.auth);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].status).toBe('CONFIRMED');
  });

  it('is safe to repeat', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);

    const [a, b] = await Promise.all([
      api().post(`/holds/${h.body.id}/confirm`).set('Authorization', alice.auth),
      api().post(`/holds/${h.body.id}/confirm`).set('Authorization', alice.auth),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await prisma.booking.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  it("does not let someone confirm another person's hold", async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const h = await hold(alice, event.seats[0].id);

    const res = await api().post(`/holds/${h.body.id}/confirm`).set('Authorization', bob.auth);
    expect(res.status).toBe(404);
  });
});

describe('when a hold expires', () => {
  it('cannot be confirmed', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);
    await expireHold(h.body.id);

    const res = await api().post(`/holds/${h.body.id}/confirm`).set('Authorization', alice.auth);
    expect(res.status).toBe(410);
  });

  it('goes back on sale immediately, without waiting for the sweep', async () => {
    const event = await createEvent({ rows: 1, cols: 2 });
    const alice = await createUser();
    const bob = await createUser();
    const seatId = event.seats[0].id;
    const h = await hold(alice, seatId);
    await expireHold(h.body.id);

    // the row is still HELD in the database; reads must treat it as free
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: h.body.id } })).status).toBe('HELD');
    const detail = await api().get(`/events/${event.id}`);
    expect(detail.body.seats[0]).toMatchObject({ status: 'available', available: true });
    expect((await api().get('/events')).body[0].seatsLeft).toBe(2);

    const bobHold = await hold(bob, seatId);
    expect(bobHold.status).toBe(201);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: h.body.id } })).status).toBe('EXPIRED');
  });

  it('can be held again by the same person', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);
    await expireHold(h.body.id);

    expect((await hold(alice, event.seats[0].id)).status).toBe(201);
  });

  it('no longer counts toward the hold limit', async () => {
    const event = await createEvent({ rows: 1, cols: 5 });
    const alice = await createUser();
    const holds = [];
    for (const seat of event.seats.slice(0, 4)) {
      holds.push(await hold(alice, seat.id));
    }
    expect((await hold(alice, event.seats[4].id)).status).toBe(409);

    await expireHold(holds[0].body.id);
    expect((await hold(alice, event.seats[4].id)).status).toBe(201);
  });

  it('is marked expired by the sweep', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);
    await expireHold(h.body.id);

    expect(await expireStaleHolds()).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: h.body.id } })).status).toBe('EXPIRED');
  });
});

describe('releasing a hold', () => {
  it('frees the seat for others', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const seatId = event.seats[0].id;
    const h = await hold(alice, seatId);

    const res = await api().delete(`/holds/${h.body.id}`).set('Authorization', alice.auth);
    expect(res.status).toBe(204);
    expect((await hold(bob, seatId)).status).toBe(201);
  });

  it('does not show up as a cancelled booking', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const h = await hold(alice, event.seats[0].id);
    await api().delete(`/holds/${h.body.id}`).set('Authorization', alice.auth);

    const mine = await api().get('/bookings/mine').set('Authorization', alice.auth);
    expect(mine.body).toHaveLength(0);
    const confirm = await api().post(`/holds/${h.body.id}/confirm`).set('Authorization', alice.auth);
    expect(confirm.status).toBe(409);
  });

  it("cannot release someone else's hold", async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const h = await hold(alice, event.seats[0].id);

    const res = await api().delete(`/holds/${h.body.id}`).set('Authorization', bob.auth);
    expect(res.status).toBe(404);
  });
});
