import { defineConfig } from 'vitest/config';

// The default `test` run (what `pnpm check` and CI's `check` job execute) covers the unit tests
// only. The Postgres integration specs (`*.integration.spec.ts`) need a real database, which the
// `check` job does not have; they run in the `e2e` job via `test:integration`, next to Postgres.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.spec.ts'],
  },
});
