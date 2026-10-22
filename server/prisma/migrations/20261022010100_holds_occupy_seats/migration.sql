-- A hold occupies its seat just like a confirmed booking, so the same index
-- now covers both: a seat can't be held by one person and booked by another.
DROP INDEX "Booking_one_active_per_seat";
CREATE UNIQUE INDEX "Booking_one_active_per_seat" ON "Booking"("seatId") WHERE "status" IN ('HELD', 'CONFIRMED');

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hold_has_expiry" CHECK ("status" <> 'HELD' OR "expiresAt" IS NOT NULL);
