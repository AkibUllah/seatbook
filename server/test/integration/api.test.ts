import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, createUser, resetDb } from './helpers';

beforeEach(resetDb);

describe('auth', () => {
  it('rejects a login with no body instead of crashing', async () => {
    const res = await api().post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect((await api().get('/health')).status).toBe(200);
  });

  it('rejects malformed JSON', async () => {
    const res = await api().post('/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });

  it('registers, normalising the email, and refuses duplicates', async () => {
    const body = { email: '  Sara@Example.com ', password: 'longenough', name: 'Sara', role: 'ATTENDEE' };
    const first = await api().post('/auth/register').send(body);
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('sara@example.com');

    const dup = await api().post('/auth/register').send({ ...body, email: 'sara@example.com' });
    expect(dup.status).toBe(409);

    const login = await api().post('/auth/login').send({ email: 'SARA@example.com', password: 'longenough' });
    expect(login.status).toBe(200);
  });

  it('lets people sign up as organizers', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ email: 'org@example.com', password: 'longenough', name: 'Org', role: 'ORGANIZER' });
    expect(res.body.user.role).toBe('ORGANIZER');
  });

  it('rejects tokens signed with the old hardcoded secret', async () => {
    const forged = jwt.sign({ id: 1, email: 'x@x', role: 'ORGANIZER' }, 'seatbook-secret-123');
    const res = await api().post('/events').set('Authorization', `Bearer ${forged}`).send({});
    expect(res.status).toBe(401);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const user = await createUser();
    const unknown = await api().post('/auth/login').send({ email: 'nobody@test.local', password: 'password123' });
    const wrong = await api().post('/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });
});

describe('creating events', () => {
  const valid = {
    title: 'Talk',
    venue: 'Hall',
    startsAt: new Date(Date.now() + 86400_000).toISOString(),
    rows: 3,
    cols: 4,
    priceCents: 1500,
  };

  it('creates the event with its seat grid', async () => {
    const organizer = await createUser('ORGANIZER');
    const res = await api().post('/events').set('Authorization', organizer.auth).send(valid);
    expect(res.status).toBe(201);

    const detail = await api().get(`/events/${res.body.id}`);
    expect(detail.body.seats).toHaveLength(12);
    expect(detail.body.seats[0].label).toBe('A1');
  });

  it.each([
    ['a negative grid', { rows: -5 }],
    ['a grid over 26 rows', { rows: 27 }],
    ['a past date', { startsAt: '2020-01-01T00:00:00Z' }],
    ['a fractional price', { priceCents: 10.5 }],
    ['a missing title', { title: '' }],
  ])('rejects %s', async (_, override) => {
    const organizer = await createUser('ORGANIZER');
    const res = await api()
      .post('/events')
      .set('Authorization', organizer.auth)
      .send({ ...valid, ...override });
    expect(res.status).toBe(400);
  });

  it('is organizer-only', async () => {
    const attendee = await createUser();
    const res = await api().post('/events').set('Authorization', attendee.auth).send(valid);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown events', async () => {
    expect((await api().get('/events/9999')).status).toBe(404);
    expect((await api().get('/events/abc')).status).toBe(404);
  });
});
