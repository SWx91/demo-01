import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from './index.js';
import { postStockMovement } from './stock.js';

// A real Postgres is required: INV-03 (non-negative) and INV-04 (no lost update) are storage-layer
// guarantees, not application logic. The workshop always has Postgres up; the seed uses the same
// default URL. Stock movements are immutable by design (US-13) — the database blocks UPDATE and
// DELETE on them — so this spec never deletes movements. It gives every test a fresh product so
// its movement history is its own, and scopes all counts to that product.
const prisma = createPrismaClient(
  process.env.DATABASE_URL ?? 'postgresql://erp:erp@localhost:5432/erp',
);

const RUN = `itest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let storeId: string;
let actorId: string;
let productSeq = 0;

beforeAll(async () => {
  const store = await prisma.store.create({
    data: { code: `${RUN}-S`, name: 'Integration Store' },
  });
  const actor = await prisma.user.create({
    data: { email: `${RUN}@test.local`, name: 'Integration Actor', passwordHash: 'x' },
  });
  storeId = store.id;
  actorId = actor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A fresh product with an opening balance of 10, so each test owns its own movement history. */
async function freshProductWithOpeningBalance(opening = 10): Promise<string> {
  const product = await prisma.product.create({
    data: {
      sku: `${RUN}-SKU-${productSeq++}`,
      name: 'Integration Product',
      category: 'Test',
      unit: 'unit',
      sellingPriceMinor: 100,
    },
  });
  await prisma.stockBalance.create({
    data: { storeId, productId: product.id, quantity: opening, version: 0 },
  });
  return product.id;
}

let productId: string;
beforeEach(async () => {
  productId = await freshProductWithOpeningBalance(10);
});

describe('postStockMovement (Postgres integration)', () => {
  it('commits the balance change and the movement together (INV-03 atomic)', async () => {
    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 8,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId,
    });

    expect(movement.balanceBefore).toBe(10);
    expect(movement.balanceAfter).toBe(18);

    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.quantity).toBe(18);
    expect(await prisma.stockMovement.count({ where: { storeId, productId } })).toBe(1);
  });

  it('rolls the movement back when the balance would go negative (all or nothing)', async () => {
    await expect(
      postStockMovement(prisma, {
        storeId,
        productId,
        quantityChange: -20,
        movementType: 'SALE',
        sourceDocument: 'SO-1',
        actorId,
      }),
    ).rejects.toThrow();

    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.quantity).toBe(10);
    // The whole posting rolled back: no movement was recorded for this product.
    expect(await prisma.stockMovement.count({ where: { storeId, productId } })).toBe(0);
  });

  it('refuses to drive the balance below zero (INV-03, enforced by the database)', async () => {
    await expect(
      postStockMovement(prisma, {
        storeId,
        productId,
        quantityChange: -11,
        movementType: 'SALE',
        sourceDocument: 'SO-2',
        actorId,
      }),
    ).rejects.toThrow();
  });

  it('does not lose an update when two postings race the same product+store (INV-04)', async () => {
    const results = await Promise.allSettled([
      postStockMovement(prisma, {
        storeId,
        productId,
        quantityChange: 5,
        movementType: 'RECEIPT',
        sourceDocument: 'PO-A',
        actorId,
      }),
      postStockMovement(prisma, {
        storeId,
        productId,
        quantityChange: 3,
        movementType: 'RECEIPT',
        sourceDocument: 'PO-B',
        actorId,
      }),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    const movements = await prisma.stockMovement.count({ where: { storeId, productId } });

    // Either both applied (final balance reflects both: 10+5+3=18, two movements) or the guard
    // correctly rejected one (final balance reflects the winner, one movement). Never a lost
    // update: the final balance is never 10 and never only one of the two changes silently dropped.
    if (succeeded === 2) {
      expect(balance.quantity).toBe(18);
      expect(movements).toBe(2);
    } else {
      expect(succeeded).toBe(1);
      expect([15, 13]).toContain(balance.quantity);
      expect(movements).toBe(1);
    }
  });

  it('refuses to update a confirmed movement (US-13 immutable)', async () => {
    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 1,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ADJ-1',
      actorId,
    });

    await expect(
      prisma.stockMovement.update({
        where: { id: movement.id },
        data: { quantityChange: 999 },
      }),
    ).rejects.toThrow();
  });

  it('refuses to delete a confirmed movement (US-13 immutable)', async () => {
    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 1,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ADJ-2',
      actorId,
    });

    await expect(prisma.stockMovement.delete({ where: { id: movement.id } })).rejects.toThrow();
  });
});
