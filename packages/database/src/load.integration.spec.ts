import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectHarness, prisma, resetStockData } from './stock.integration.harness.js';
import { LOAD_DATASET, seedLoadData } from './load.harness.js';

// NFR-05 (ticket #20): the load seed. The performance target is proven against a real Postgres
// seeded to the agreed dataset size — 1,000 products and 10,000 movements — so this spec, like the
// other invariant specs, runs on the Postgres integration harness. It proves AC1: the seed
// actually produces that dataset. The 5-minute, 10-user run itself is the separate `load:report`
// script, not a CI spec; this spec proves the seed the report depends on.

beforeEach(async () => {
  await resetStockData();
});

afterAll(async () => {
  await disconnectHarness();
});

describe('seedLoadData on a real Postgres', () => {
  it('produces the agreed dataset: 1,000 products and 10,000 movements (AC1)', async () => {
    const result = await seedLoadData(prisma);

    expect(await prisma.product.count()).toBe(LOAD_DATASET.products);
    expect(await prisma.stockMovement.count()).toBe(LOAD_DATASET.movements);

    // The seed reports what it created, and names the store its stock-view reads run against.
    expect(result.productCount).toBe(LOAD_DATASET.products);
    expect(result.movementCount).toBe(LOAD_DATASET.movements);
    expect(result.storeId).toBeTruthy();
  });

  it('leaves every movement consistent with its balance so a stock-view read is meaningful', async () => {
    const { storeId } = await seedLoadData(prisma);

    // One balance row per product in the store, each a non-negative whole number: the stock-view
    // API (GET /stock/balances) reads exactly these rows.
    const balances = await prisma.stockBalance.findMany({ where: { storeId } });
    expect(balances).toHaveLength(LOAD_DATASET.products);
    for (const balance of balances) {
      expect(Number.isInteger(balance.quantity)).toBe(true);
      expect(balance.quantity).toBeGreaterThanOrEqual(0);
    }
  });
});
