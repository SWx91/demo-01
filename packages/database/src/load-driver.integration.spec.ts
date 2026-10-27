import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectHarness, prisma, resetStockData } from './stock.integration.harness.js';
import { seedLoadData } from './load.harness.js';
import { prismaReadOperations, runLoad } from './load-driver.js';

// NFR-05 (ticket #20): the load driver, AC2 — N concurrent users drive search and stock-view for a
// set time. The driver itself only knows how to drive concurrency and time requests; the two
// operations are injected, so the `load:report` script can drive the real HTTP APIs while this
// spec drives the query layer directly (fast, no server to start). This proves the mechanism with
// a short run against a real Postgres via `prismaReadOperations`, which issues the same queries the
// search (GET /products) and stock-view (GET /stock/balances) controllers issue.

beforeEach(async () => {
  await resetStockData();
});

afterAll(async () => {
  await disconnectHarness();
});

describe('runLoad against a real Postgres (query layer)', () => {
  it('drives both search and stock-view and summarizes each with a p95 (AC2)', async () => {
    const seed = await seedLoadData(prisma);

    const result = await runLoad({
      operations: prismaReadOperations(prisma, seed),
      users: 4,
      durationMs: 300,
    });

    expect(result.search.count).toBeGreaterThanOrEqual(4);
    expect(result.stockView.count).toBeGreaterThanOrEqual(4);
    expect(result.search.p95Ms).toBeGreaterThan(0);
    expect(result.stockView.p95Ms).toBeGreaterThan(0);
    expect(typeof result.search.withinBudget).toBe('boolean');
    expect(typeof result.stockView.withinBudget).toBe('boolean');
    expect(result.users).toBe(4);
    expect(result.durationMs).toBe(300);
  });

  it('runs the configured number of concurrent users, not more', async () => {
    const seed = await seedLoadData(prisma);

    const result = await runLoad({
      operations: prismaReadOperations(prisma, seed),
      users: 2,
      durationMs: 200,
    });

    expect(result.users).toBe(2);
    for (const summary of [result.search, result.stockView]) {
      expect(summary.minMs).toBeGreaterThanOrEqual(0);
      expect(summary.maxMs).toBeGreaterThanOrEqual(summary.minMs);
      expect(Number.isFinite(summary.meanMs)).toBe(true);
    }
  });
});

describe('runLoad with injected operations (no database)', () => {
  it('drives whatever search and stock-view operations it is given', async () => {
    let searchCalls = 0;
    let stockViewCalls = 0;
    const result = await runLoad({
      operations: {
        search: async () => {
          searchCalls++;
        },
        stockView: async () => {
          stockViewCalls++;
        },
      },
      users: 3,
      durationMs: 50,
    });

    expect(searchCalls).toBe(result.search.count);
    expect(stockViewCalls).toBe(result.stockView.count);
    expect(result.search.count).toBeGreaterThanOrEqual(3);
  });
});
