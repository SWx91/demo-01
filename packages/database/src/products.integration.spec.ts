import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isSkuEditable } from './products.js';
import {
  disconnectHarness,
  prisma,
  resetStockData,
  seedScenario,
  type Scenario,
} from './stock.integration.harness.js';
import { postStockMovement } from './stock.js';

// MD-01 (ticket #18): a product's SKU freezes once a stock movement references it. Proven
// against a real Postgres because the question is "does a movement row for this product exist",
// which only a real query against the stock_movement table can answer; the oRPC controller spec
// covers the same acceptance criteria with a mocked Prisma client instead.

let scenario: Scenario;

beforeEach(async () => {
  await resetStockData();
  scenario = await seedScenario(10);
});

afterAll(async () => {
  await disconnectHarness();
});

describe('isSkuEditable on a real Postgres', () => {
  it('allows correcting the SKU when no movement yet references the product (AC1)', async () => {
    const { productId } = scenario;

    expect(await prisma.stockMovement.count({ where: { productId } })).toBe(0);
    await expect(isSkuEditable(prisma, productId, 'OLD-SKU', 'NEW-SKU')).resolves.toBe(true);
  });

  it('freezes the SKU once a movement references the product (AC2)', async () => {
    const { storeId, productId, actorId } = scenario;
    await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 5,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId,
    });

    expect(await prisma.stockMovement.count({ where: { productId } })).toBe(1);
    await expect(isSkuEditable(prisma, productId, 'OLD-SKU', 'NEW-SKU')).resolves.toBe(false);
  });

  it('resubmitting the same SKU is always allowed, movement or not (AC3)', async () => {
    const { storeId, productId, actorId } = scenario;
    await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 5,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-2',
      actorId,
    });

    // The SKU itself is unchanged, so the movement count is never even consulted — other fields
    // (name, category, unit, price, active) stay editable after the freeze.
    await expect(isSkuEditable(prisma, productId, 'SAME-SKU', 'SAME-SKU')).resolves.toBe(true);
  });
});
