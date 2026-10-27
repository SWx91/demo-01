import { defineConfig } from 'vitest/config';

// Only the Postgres integration specs. Run against a real database (CI's `e2e` job, or a local
// Docker Postgres) with `pnpm --filter @erp/database test:integration`. Single-threaded so the
// concurrency test owns the database for its race.
export default defineConfig({
  test: {
    include: ['**/*.integration.spec.ts'],
    fileParallelism: false,
  },
});
