-- Separate migration: a new enum value can't be used in the transaction that adds it.
-- Released holds are the only CANCELLED rows that still carry an expiresAt:
-- confirming a hold clears it, and bookings made directly never had one.
UPDATE "Booking" SET "status" = 'RELEASED' WHERE "status" = 'CANCELLED' AND "expiresAt" IS NOT NULL;
