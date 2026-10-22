-- POST /bookings used to check for an existing booking and then insert, so two
-- concurrent requests could both confirm the same seat. Existing duplicates must
-- be resolved before the unique index can be created: keep the earliest
-- confirmed booking for each seat (first come, first served) and cancel the rest.
-- The customers whose bookings are cancelled here need to be contacted.
UPDATE "Booking" AS b
SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP
WHERE b."status" = 'CONFIRMED'
  AND EXISTS (
    SELECT 1 FROM "Booking" AS earlier
    WHERE earlier."seatId" = b."seatId"
      AND earlier."status" = 'CONFIRMED'
      AND earlier."id" < b."id"
  );

-- At most one confirmed booking per seat. Prisma can't express partial indexes
-- in schema.prisma, so this index only exists in migrations.
CREATE UNIQUE INDEX "Booking_one_active_per_seat" ON "Booking"("seatId") WHERE "status" = 'CONFIRMED';

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
