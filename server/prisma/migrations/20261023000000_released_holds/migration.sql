-- AlterEnum
-- A hold the attendee let go of is not a cancelled booking. Until now both were
-- CANCELLED, so released holds showed up in My Bookings as cancelled bookings.
ALTER TYPE "BookingStatus" ADD VALUE 'RELEASED';
