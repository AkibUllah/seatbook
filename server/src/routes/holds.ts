import { Router } from 'express';
import { asyncHandler } from '../errors';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { claimSeat, confirmHold, releaseHold } from '../services/bookingService';
import { idParam, seatBody } from '../validation';

const router = Router();

router.use(requireAuth, requireRole('ATTENDEE'));

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res) => {
    const { seatId } = seatBody.parse(req.body);
    const hold = await claimSeat(req.user!.id, seatId, 'HELD');

    res.status(201).json({
      id: hold.id,
      seatId: hold.seatId,
      label: hold.seat.label,
      expiresAt: hold.expiresAt,
      // lets the client correct for its own clock when counting down
      serverTime: new Date(),
    });
  })
);

router.post(
  '/:id/confirm',
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = idParam.parse(req.params);
    const booking = await confirmHold(req.user!.id, id);

    res.json({ id: booking.id, status: booking.status, seat: booking.seat.label });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = idParam.parse(req.params);
    await releaseHold(req.user!.id, id);

    res.status(204).end();
  })
);

export default router;
