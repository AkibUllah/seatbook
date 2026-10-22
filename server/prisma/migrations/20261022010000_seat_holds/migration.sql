-- AlterEnum
-- New enum values can't be used in the same transaction that adds them, so the
-- index and constraint that mention HELD live in the next migration.
ALTER TYPE "BookingStatus" ADD VALUE 'HELD';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");
