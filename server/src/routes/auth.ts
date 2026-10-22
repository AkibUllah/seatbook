import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Prisma, User } from '@prisma/client';
import prisma from '../db';
import { config } from '../config';
import { asyncHandler, HttpError } from '../errors';
import { signToken } from '../middleware/auth';
import { loginBody, registerBody } from '../validation';

const router = Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // brute-force protection: only failed attempts count, so switching accounts doesn't lock anyone out
    skipSuccessfulRequests: true,
    message: { error: 'Too many attempts, please try again later' },
  })
);

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function session(user: User) {
  return {
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = registerBody.parse(req.body);

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({ data: { email, name, passwordHash, role } });
      res.status(201).json(session(user));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new HttpError(409, 'An account with this email already exists');
      }
      throw err;
    }
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginBody.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new HttpError(401, 'Invalid email or password');
    }

    res.json(session(user));
  })
);

export default router;
