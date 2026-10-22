function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: '7d' as const,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  holdMinutes: 10,
  maxHoldsPerEvent: 4,
};
