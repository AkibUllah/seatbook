import { defineConfig } from 'vitest/config';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL must be set to run integration tests');
}

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/globalSetup.ts'],
    env: {
      DATABASE_URL: url,
      JWT_SECRET: 'integration-test-secret',
      AUTH_RATE_LIMIT: '10000',
    },
    // the files share one database
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
