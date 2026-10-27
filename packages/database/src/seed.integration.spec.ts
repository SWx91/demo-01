import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../prisma/seed.js';
import { disconnectHarness, prisma } from './stock.integration.harness.js';

// Guards the seed's opening balances (TOR §8.1): B01 holds SKU001=10, SKU002=5, SKU003=0; every B02
// balance is zero. The invariant specs on the same harness truncate the stock tables between
// scenarios, so this spec re-seeds first (the seed is idempotent, keyed on code/SKU) and then reads
// the balances back — it does not depend on `prisma db seed` having run, nor on test ordering.
describe('seeded opening balances (real Postgres)', () => {
  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectHarness();
  });

  async function balance(storeCode: string, sku: string): Promise<number | undefined> {
    const store = await prisma.store.findUnique({ where: { code: storeCode } });
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!store || !product) return undefined;
    const row = await prisma.stockBalance.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    return row?.quantity;
  }

  it('seeds B01 with SKU001=10, SKU002=5, SKU003=0', async () => {
    expect(await balance('B01', 'SKU001')).toBe(10);
    expect(await balance('B01', 'SKU002')).toBe(5);
    expect(await balance('B01', 'SKU003')).toBe(0);
  });

  it('seeds every B02 balance at zero', async () => {
    expect(await balance('B02', 'SKU001')).toBe(0);
    expect(await balance('B02', 'SKU002')).toBe(0);
    expect(await balance('B02', 'SKU003')).toBe(0);
  });
});
