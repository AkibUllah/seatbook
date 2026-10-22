import { execSync } from 'node:child_process';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL!;
  // every test truncates the tables, so never point this at a real database
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against ${url}: database name must end in _test`);
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
