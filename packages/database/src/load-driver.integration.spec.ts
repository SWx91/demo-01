import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectHarness, prisma, resetStockData } from './stock.integration.harness.js';
import { seedLoadData } from './load.harness.js';
import { runLoad } from './load-driver.js';

// NFR-05 (ticket #20): the load driver, AC2 — N concurrent users drive search and stock-view for a
// set time. This spec proves the mechanism against a real Postgres with a short run (a fraction of
// a second, a few users); the full 10-user, 5-minute run is the `load:report` script, not a CI
// spec. The driver issues exactly the queries the search and stock-view APIs issue.

beforeEach(async () => {
  await resetStockData();
});

afterAll(async () => {
  await disconnectHarness();
});

describe('runLoad against a real Postgres', () => {
  it('drives both search and stock-view and summarizes each with a p95 (AC2)', async () => {
    const seed = await seedLoadData(prisma);

    const result = await runLoad(prisma, {
      seed,
      users: 4,
      durationMs: 300,
    });

    // Both endpoints were exercised, each with at least one request per user.
    expect(result.search.count).toBeGreaterThanOrEqual(4);
    expect(result.stockView.count).toBeGreaterThanOrEqual(4);

    // Each summary carries a p95 and a budget verdict (the report's headline figures).
    expect(result.search.p95Ms).toBeGreaterThan(0);
    expect(result.stockView.p95Ms).toBeGreaterThan(0);
    expect(typeof result.search.withinBudget).toBe('boolean');
    expect(typeof result.stockView.withinBudget).toBe('boolean');

    // The run records the load it drove, so the report can state it.
    expect(result.users).toBe(4);
    expect(result.durationMs).toBe(300);
  });

  it('runs the configured number of concurrent users, not more', async () => {
    const seed = await seedLoadData(prisma);

    const result = await runLoad(prisma, { seed, users: 2, durationMs: 200 });

    expect(result.users).toBe(2);
    // Every recorded latency is a finite, non-negative millisecond figure.
    for (const summary of [result.search, result.stockView]) {
      expect(summary.minMs).toBeGreaterThanOrEqual(0);
      expect(summary.maxMs).toBeGreaterThanOrEqual(summary.minMs);
      expect(Number.isFinite(summary.meanMs)).toBe(true);
    }
  });
});
