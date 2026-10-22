import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/db';
import { activeBookingsForSeat, api, createEvent, createUser, resetDb } from './helpers';

beforeEach(resetDb);

describe('booking a seat', () => {
  it('gives a seat to exactly one of many concurrent buyers', async () => {
    const event = await createEvent();
    const seatId = event.seats[0].id;
    const buyers = await Promise.all(Array.from({ length: 20 }, () => createUser()));

    const results = await Promise.all(
      buyers.map((b) => api().post('/bookings').set('Authorization', b.auth).send({ seatId }))
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(await activeBookingsForSeat(seatId)).toBe(1);
  });

  it('does not let organizers book', async () => {
    const event = await createEvent();
    const organizer = await createUser('ORGANIZER');

    const res = await api().post('/bookings').set('Authorization', organizer.auth).send({ seatId: event.seats[0].id });
    expect(res.status).toBe(403);
  });

  it('refuses seats for events that have started', async () => {
    const event = await createEvent({ startsInHours: -1 });
    const alice = await createUser();

    const res = await api().post('/bookings').set('Authorization', alice.auth).send({ seatId: event.seats[0].id });
    expect(res.status).toBe(409);
  });
});

describe('cancelling a booking', () => {
  it("does not let one attendee cancel another's booking", async () => {
    const event = await createEvent();
    const alice = await createUser();
    const bob = await createUser();
    const booking = await api().post('/bookings').set('Authorization', alice.auth).send({ seatId: event.seats[0].id });

    const res = await api().post(`/bookings/${booking.body.id}/cancel`).set('Authorization', bob.auth);

    expect(res.status).toBe(404);
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.body.id } });
    expect(stored.status).toBe('CONFIRMED');
  });

  it('puts the seat back on sale', async () => {
    const event = await createEvent({ rows: 1, cols: 3 });
    const alice = await createUser();
    const bob = await createUser();
    const seatId = event.seats[0].id;
    const booking = await api().post('/bookings').set('Authorization', alice.auth).send({ seatId });

    let list = await api().get('/events');
    expect(list.body[0].seatsLeft).toBe(2);

    const cancel = await api().post(`/bookings/${booking.body.id}/cancel`).set('Authorization', alice.auth);
    expect(cancel.status).toBe(200);

    list = await api().get('/events');
    expect(list.body[0].seatsLeft).toBe(3);

    const rebook = await api().post('/bookings').set('Authorization', bob.auth).send({ seatId });
    expect(rebook.status).toBe(201);
  });

  it('can only cancel once', async () => {
    const event = await createEvent();
    const alice = await createUser();
    const booking = await api().post('/bookings').set('Authorization', alice.auth).send({ seatId: event.seats[0].id });

    await api().post(`/bookings/${booking.body.id}/cancel`).set('Authorization', alice.auth);
    const again = await api().post(`/bookings/${booking.body.id}/cancel`).set('Authorization', alice.auth);
    expect(again.status).toBe(409);
  });
});
