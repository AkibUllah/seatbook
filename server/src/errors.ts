import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Express 4 does not catch rejected promises from async handlers; an unhandled
// rejection crashes the process. Route every async handler through this.
export function asyncHandler<R extends Request>(fn: (req: R, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res).catch(next);
  };
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first.path.join('.');
    return res.status(400).json({
      error: field ? `${field}: ${first.message}` : first.message,
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  // other body-parser errors (body too large, bad encoding) carry their own status
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
