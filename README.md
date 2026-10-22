# Seatbook

Seat booking for small venues. Organizers publish an event with a seat grid, attendees hold a seat for 10 minutes while they decide, then confirm it.

**Handover notes for Mr. Rahman are [below](#handover).**

## Stack

- **server/**: Node, Express, TypeScript, Prisma, Postgres
- **client/**: React, Vite, TypeScript, Tailwind

## Run it

```bash
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:4000
- Postgres: `localhost:5433` (user / password / db: `seatbook`)

The database is migrated and seeded on first start. To start from a clean database: `docker compose down -v`. The first start initialises Postgres, which can take a few minutes on a slow machine; the server waits for it.

**After changing `schema.prisma`:** create the migration from your machine (`cd server && npx prisma migrate dev`, with `DATABASE_URL` pointing at `localhost:5433`), then `docker compose restart server`. **Know about `Booking_one_active_per_seat`**: it is a partial unique index that Prisma can't express in the schema, so it only exists in the migrations, and it is what prevents double booking. Prisma 5 leaves it alone when generating migrations (checked), and the integration tests fail if it ever goes missing.

### Seeded accounts

All passwords are `password123`. The seed is skipped when `NODE_ENV=production`.

| Email | Role |
|---|---|
| organizer@seatbook.test | Organizer |
| alice@seatbook.test | Attendee |
| bob@seatbook.test | Attendee |

### Without Docker

```bash
cd server && cp .env.example .env   # then set JWT_SECRET (openssl rand -hex 32)
npm install && npm run db:migrate && npm run db:seed && npm run dev
cd client && npm install && npm run dev
```

You need a Postgres running at the `DATABASE_URL` in `server/.env`.

### Configuration (server)

| Variable | Required | Default | |
|---|---|---|---|
| `DATABASE_URL` | yes | | |
| `JWT_SECRET` | yes | | The server refuses to start without it. Use a long random value per environment. |
| `CORS_ORIGIN` | | `http://localhost:5173` | Comma-separated list of allowed client origins. |
| `TRUST_PROXY` | | `0` | Number of reverse proxies in front of the API, so rate limiting sees real client IPs. |
| `AUTH_RATE_LIMIT` | | `20` | Login/signup attempts per IP per 15 minutes. |
| `PORT` | | `4000` | |

## Tests

```bash
docker compose exec server npm test                    # unit tests
docker compose exec server npm run test:integration    # API tests against Postgres (seatbook_test)
docker compose exec client npm run typecheck
```

The integration tests run against a real Postgres because the bugs that matter here are races. They create and migrate a separate `seatbook_test` database and refuse to run against any database whose name doesn't end in `_test`.

## API

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account (`role`: `ATTENDEE` or `ORGANIZER`), returns a token |
| POST | `/auth/login` | none | Log in, returns a token |
| GET | `/events` | none | List events with seats left |
| GET | `/events/:id` | optional | One event with its seat map. Logged in, also your active holds |
| POST | `/events` | organizer | Create an event and its seats |
| POST | `/holds` | attendee | Hold a seat for 10 minutes |
| POST | `/holds/:id/confirm` | attendee | Turn your hold into a booking |
| DELETE | `/holds/:id` | attendee | Release your hold |
| POST | `/bookings` | attendee | Book a seat immediately, without a hold |
| GET | `/bookings/mine` | attendee | Your bookings |
| POST | `/bookings/:id/cancel` | attendee | Cancel one of your bookings |

Send the token as `Authorization: Bearer <token>`. Errors are always `{ "error": "message" }` with a matching status: 400 invalid input, 401 not logged in, 403 wrong role, 404 not found (including other people's bookings and holds), 409 seat taken or state conflict, 410 hold expired, 429 too many login attempts, 503 busy.

---

## Handover

Mr. Rahman, this is what I found, what I changed, and what is still between this and taking real customers' money.

### What I changed and why

I reproduced each problem against your original code before fixing it, so the numbers below are what actually happened.

**Bugs that would have hurt customers or the business**

| Problem | What happened when I tried it | Fix |
|---|---|---|
| **The same seat could be sold many times.** Booking checked "is this seat free?" and then saved, so people booking at the same moment all passed the check. | 10 requests for one seat at once: **10 confirmed bookings**. | The database now allows only one active booking per seat (a partial unique index), and the code lets the insert fail instead of checking first. 20 at once now gives 1 booking and 19 "seat taken". |
| **Anyone logged in could cancel anyone's booking.** | Bob cancelled Alice's booking. | Cancel only finds your own bookings. Someone else's looks like "not found". |
| **Anyone could log in as an organizer without a password.** The secret that signs logins was written in the code, which is public. | I made an organizer login from the secret alone and created an event with `-5` rows. | The secret comes from configuration and the server won't start without one. |
| **One request could take the whole site down.** | A login with an empty form crashed the server. The container still looked "up", so nothing would have restarted it. | Every route's errors are caught and answered properly. |
| **Cancelled seats never came back on the events list.** | "36 seats left" when 38 were free. | Only active bookings count. |
| `docker compose up --build` **failed on a clean machine** if Postgres took longer than 40 seconds to initialise. | On my machine first boot took about 3 minutes. | The health check waits for the real database server and allows a slow first boot. |
| The event page showed a **5% service fee and a total the server never charged.** | | Removed. The page shows what the customer actually pays. |
| Seeded evening talks showed as **12:30 AM**. | | They start at 6:30 PM Dhaka time. |

**Other production basics.** Input validation on every endpoint (seat grid size, dates in the future, whole-number prices, real email addresses, passwords of 8+ characters). Organizers can't book seats and attendees can't create events. Login takes the same time whether or not the email exists, so it doesn't reveal who has an account. Login attempts are rate limited. Security headers, a request size limit, CORS restricted to the app, a health check that checks the database, and graceful shutdown. Organizers can sign up from the app again (the form never sent the role). My Bookings no longer adds cancelled bookings to "Total Spent" or offers to cancel past or cancelled bookings.

**Seat holds**

- Click a free seat to hold it for 10 minutes. Nobody else can hold or book it meanwhile. Click it again to let it go. Confirm turns your holds into bookings.
- A countdown per seat shows the time left, and goes red in the last minute. It runs on the server's clock, so it is right even if the customer's computer clock is wrong. When it runs out, the page says the seat went back on sale.
- Other people see the seat as "held" (not by whom), so they know it may come free. The seat map refreshes every 15 seconds.

How it works, for whoever maintains this next:

- **A hold is a booking with status `HELD` and an `expiresAt`.** The same database index protects holds and bookings, so a seat can never be held by one person and booked by another.
- **Expiry is decided when reading,** not by a timer: a seat is taken if it has a `CONFIRMED` booking or a `HELD` one whose `expiresAt` is still in the future. A seat goes back on sale at exactly the right moment even if the server was restarted. A job marks old holds `EXPIRED` every minute, but only for tidiness; nothing depends on it.
- **Confirming is a single conditional update** ("set CONFIRMED where it's mine, still held, not expired"), so it can't race with expiry or with someone grabbing the seat the moment it expires.
- **The 4-hold limit can't be beaten by clicking fast:** holds by the same person are processed one at a time (row lock on the user).
- When a popular event opens, most requests are for seats already gone. Those are answered with a quick read before any locking. With 500 people grabbing 24 seats at once, the server gave out exactly 24 holds and no errors.

### Assumptions I made

The request left these open, so I decided and wrote them down. Each is easy to change.

- **Up to 4 seats held at once per person per event**, so people can book for family or friends without one person blocking a whole hall.
- **The 10 minutes start when the seat is held and can't be extended.** When a hold expires, anyone can take the seat at once, including the same person.
- **Confirming is booking.** There is no payment step (out of scope); see below.
- **Only attendee accounts book.** Organizers manage events. The original API docs already said this; the code didn't enforce it.
- **Bookings can be cancelled until the event starts,** and the seat goes straight back on sale.
- **Duplicate bookings already in the database:** the migration keeps the earliest booking for each seat and cancels the later ones, because the safety index can't be created while duplicates exist.
- **Prices stay in US dollars.** Nothing in the brief or the code says taka, and the existing tests expect dollars. See below.
- **"Book now" without a hold still exists in the API** (`POST /bookings`) so anything already using it keeps working. The app itself always holds first.

### What I'd still do before launch

In order of importance:

1. **Payments.** Today "confirm" books the seat for free. Payment belongs in the confirm step, and the hold should stay valid while a payment is in progress, so a slow payment page doesn't lose someone their seat.
2. **Check the live database for double bookings before deploying.** If any happened, the migration keeps the earliest and cancels the rest. Those customers need to be told (and refunded if they paid). Query to run first:
   `SELECT "seatId", count(*) FROM "Booking" WHERE status = 'CONFIRMED' GROUP BY "seatId" HAVING count(*) > 1;`
3. **Who can be an organizer.** Anyone can sign up as an organizer and publish events. The brief required keeping that, but before launch it should need your approval or an invitation.
4. **A production setup.** The Docker setup is for development: it runs the API with file watching and the Vite dev server. Production needs a built server and client, `NODE_ENV=production`, a real `JWT_SECRET`, HTTPS, `CORS_ORIGIN` and `TRUST_PROXY` set, database backups, and error monitoring.
5. **Accounts.** Email verification and password reset (out of scope here). Logins last 7 days and live in the browser's local storage, and can't be revoked. Move to secure cookies with shorter sessions.
6. **Currency.** Please confirm whether you sell tickets in USD or BDT. Switching is a one-line change in `formatPrice` plus real prices.
7. **Mobile.** The pages use a fixed desktop layout and don't work well on a phone, which is probably where many customers will book.
8. **More than one server.** The login rate limit is kept in memory, so with several API instances it needs a shared store such as Redis.

### Weakest part of my work

**Everything rests on one database index that the schema file doesn't show.** The rule "one active booking per seat" is a partial unique index. Prisma's schema file can't express it, so it lives only in the migration SQL. A developer reading `schema.prisma` to understand the data can't see the most important rule in it. I checked that Prisma 5.22 doesn't try to drop the index when generating new migrations, but that's tool behaviour I'm relying on, not something the schema guarantees: a future Prisma upgrade, or someone squashing or rewriting the migrations, could lose it, and double booking would silently come back. I've put a note in `schema.prisma` and this README, and the integration tests fail if the index is missing (I checked by dropping it: 5 of 20 simultaneous requests got the same seat). Still, it relies on people running the tests.

Smaller weaknesses: confirming several held seats confirms each one separately, so in a rare case (one hold expiring mid-confirm) you could get some seats and not others. The page tells you which. Others see new holds up to 15 seconds late (the server always has the final say, so this only affects the display).

### One place the AI was wrong

I used Claude Code throughout (transcripts in `ai-transcripts/`). The clearest case where it was wrong: **it recommended switching prices to Bangladeshi taka**, reasoning that the business is in Dhaka. I asked why, and whether the brief mentioned taka anywhere. It didn't, and the existing unit test explicitly expects dollars (`formatPrice(1500)` → `$15.00`). Swapping only the symbol would also have turned a $40 workshop into ৳40, about 35 US cents. Changing currency would have been an unrequested product change based on a guess. So prices stay in dollars, and the currency question is on the list above for you to decide.

It also made smaller mistakes that were caught before they were committed, most of them by the AI itself when re-checking its work. It first listed organizer self-signup as a security bug to remove, though the brief says signing up as an organizer must keep working. One test it wrote checked a hardcoded email and would have passed for the wrong reason. And it initially trusted the `X-Forwarded-For` header unconditionally, which would let anyone bypass the login rate limit. It also overstated a risk in the first draft of this note, claiming Prisma would try to drop the partial index in future migrations. A second review pass questioned that, and checking showed Prisma 5.22 leaves the index alone, so the weakest-part section above was corrected.

### How I checked it works

- **Reproduced first.** Every bug in the table above was triggered against the original code, with the result recorded before the fix.
- **36 integration tests against a real Postgres**, covering: concurrent booking and holding (20 at once, exactly one wins); the 4-hold limit under 10 parallel requests; holds expiring (can't confirm, back on sale without waiting for the cleanup job, no longer counting toward the limit); confirm/release/cancel only by the owner; repeat confirms; validation; old forged logins rejected; empty login returning 400 with the server still up. I checked the race tests actually catch the bug by removing the index: they fail.
- **In a real browser, with two users at once:** Alice holds a seat and the countdown ticks, Bob sees it held and can't click it, Alice confirms, a hold expires while the page is open and the seat goes back on sale, Bob takes it right after, the 4-hold limit, releasing, My Bookings totals, organizer signup and event creation.
- **Load:** 500 simultaneous hold requests for a 24-seat event, with exactly 24 holds and no errors. The first run of this test found 178 errors, which led to the fix described above.
- **From a clean start:** `docker compose down -v && docker compose up --build`, then all of the above.
