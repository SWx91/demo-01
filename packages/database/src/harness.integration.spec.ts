import { afterAll, describe, expect, it } from 'vitest';
import {
  disconnectHarness,
  prisma,
  resetStockData,
  seedScenario,
} from './stock.integration.harness.js';

// Proves the harness itself: the reset actually returns the stock tables to empty, and seeding
// after a reset gives a scenario its own world. The invariant specs rely on both.
describe('Postgres integration harness', () => {
  afterAll(async () => {
    await disconnectHarness();
  });

  it('resetStockData clears every stock table it owns', async () => {
    const { storeId, productId, actorId } = await seedScenario(7);
    await prisma.stockMovement.create({
      data: {
        storeId,
        productId,
        actorId,
        quantityChange: 1,
        balanceBefore: 7,
        balanceAfter: 8,
        movementType: 'ADJUSTMENT',
        sourceDocument: 'SETUP',
        productNameSnapshot: 'Integration Product',
        sellingPriceMinorSnapshot: 100,
      },
    });

    // Preconditions: there is data to clear.
    expect(await prisma.stockMovement.count()).toBeGreaterThan(0);
    expect(await prisma.stockBalance.count()).toBeGreaterThan(0);
    expect(await prisma.product.count()).toBeGreaterThan(0);

    await resetStockData();

    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.stockBalance.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.store.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it('seedScenario after a reset yields a fresh product at the opening balance', async () => {
    await resetStockData();
    const { storeId, productId } = await seedScenario(10);

    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.quantity).toBe(10);
    expect(await prisma.stockMovement.count()).toBe(0);
  });
});
