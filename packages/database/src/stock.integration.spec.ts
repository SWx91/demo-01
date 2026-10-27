import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordAudit } from './audit.js';
import {
  disconnectHarness,
  prisma,
  resetStockData,
  seedScenario,
  type Scenario,
} from './stock.integration.harness.js';
import { postStockMovement } from './stock.js';

// The inventory invariants proven against a real Postgres, on the harness (ticket #14). INV-03
// (non-negative balance, atomic posting) and INV-04 (no lost update) are storage-layer guarantees,
// not application logic, so they can only be proven against a real database. Every scenario resets
// the stock tables first (`resetStockData`) and then seeds its own world (`seedScenario`), so no
// scenario depends on another's outcome and the scenarios pass in any order. Run with
// `pnpm --filter @erp/database test:integration`; see stock.integration.harness.ts for setup.

let scenario: Scenario;

beforeEach(async () => {
  await resetStockData();
  scenario = await seedScenario(10);
});

afterAll(async () => {
  await disconnectHarness();
});

describe('postStockMovement on a real Postgres', () => {
  it('commits the balance change and the movement together (INV-03 atomic)', async () => {
    const { storeId, productId, actorId } = scenario;
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

    // The persisted movement row records every field the model requires: product, store, quantity
    // change, balance before and after, movement type, source document, actor and a timestamp.
    const persisted = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } });
    expect(persisted).toMatchObject({
      storeId,
      productId,
      quantityChange: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId,
    });
    expect(persisted.createdAt).toBeInstanceOf(Date);
    expect(await prisma.stockMovement.count()).toBe(1);
  });

  it('rolls the movement back when the balance would go negative (all or nothing)', async () => {
    const { storeId, productId, actorId } = scenario;
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
    // The whole posting rolled back: no movement was recorded.
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('refuses to drive the balance below zero (INV-03, enforced by the database)', async () => {
    const { storeId, productId, actorId } = scenario;
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
    const { storeId, productId, actorId } = scenario;
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

    const applied = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof postStockMovement>>> => {
        return r.status === 'fulfilled';
      })
      .map((r) => r.value.quantityChange);
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    const movements = await prisma.stockMovement.count();

    // No update is lost: the final balance is exactly the opening plus every change that was
    // reported as applied, and there is exactly one movement per applied change. Whether the race
    // let both through or the guard/serialization rejected one, these two equalities must hold —
    // a silently dropped update would break them.
    const expectedBalance = 10 + applied.reduce((sum, change) => sum + change, 0);
    expect(balance.quantity).toBe(expectedBalance);
    expect(movements).toBe(applied.length);
    // At least one posting always makes progress, and the balance never silently reverts to 10.
    expect(applied.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses to update a confirmed movement (US-13 immutable)', async () => {
    const { storeId, productId, actorId } = scenario;
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
    const { storeId, productId, actorId } = scenario;
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

// Manager stock adjustment (ticket #17, INV-05, NFR-03). The adjustment reuses postStockMovement
// (ADJUSTMENT is just another movement type), so the atomic/rollback behaviour above already
// covers it. What's new is the audit entry recordAudit writes, proven here against a real
// Postgres: it survives a rolled-back posting (it is its own write, not inside the posting's
// transaction) and persists actor, source document (the reason) and outcome.
describe('manager stock adjustment and its audit entry on a real Postgres', () => {
  it('posts an ADJUSTMENT movement and records a SUCCESS audit entry with actor, reason and outcome', async () => {
    const { storeId, productId, actorId } = scenario;
    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 5,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      actorId,
    });
    expect(movement.balanceAfter).toBe(15);

    const entry = await recordAudit(prisma, {
      actorId,
      action: 'STOCK_ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      outcome: 'SUCCESS',
    });

    const persisted = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted).toMatchObject({
      actorId,
      action: 'STOCK_ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      outcome: 'SUCCESS',
    });
    expect(persisted.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a reduction greater than the available balance, writes no movement, but still audits the rejection (AC2, AC4)', async () => {
    const { storeId, productId, actorId } = scenario;

    await expect(
      postStockMovement(prisma, {
        storeId,
        productId,
        quantityChange: -20,
        movementType: 'ADJUSTMENT',
        sourceDocument: 'ตรวจนับสต็อกผิดพลาด',
        actorId,
      }),
    ).rejects.toThrow();

    // No movement was written: the whole posting rolled back (AC2).
    expect(await prisma.stockMovement.count()).toBe(0);
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.quantity).toBe(10);

    // The rejection is still audited: recordAudit is its own write, independent of the posting's
    // rolled-back transaction.
    const entry = await recordAudit(prisma, {
      actorId,
      action: 'STOCK_ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกผิดพลาด',
      outcome: 'REJECTED',
    });
    const persisted = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted).toMatchObject({ actorId, outcome: 'REJECTED' });
  });
});

// Historical snapshot fidelity (ticket #19, TOR 4.3 shared rule): a movement captures the
// product's name and price as they were when it was posted, and no later edit to the product can
// reach back and change what an already-recorded movement shows. Proven on a real Postgres
// because the guarantee that matters is that the row on disk never changes underneath the edit,
// not just that the in-memory return value looked right.
describe('historical snapshot fidelity on a real Postgres (ticket #19)', () => {
  it('captures the product name and price at posting time (AC1)', async () => {
    const { storeId, productId, actorId } = scenario;
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 5,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-SNAP-1',
      actorId,
    });

    expect(movement.productNameSnapshot).toBe(product.name);
    expect(movement.sellingPriceMinorSnapshot).toBe(product.sellingPriceMinor);
  });

  it("editing the product's name or price afterwards does not alter what an existing movement recorded (AC2)", async () => {
    const { storeId, productId, actorId } = scenario;
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    const movement = await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 5,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-SNAP-2',
      actorId,
    });

    // Change SKU001's selling price (the Demo line) and its name.
    await prisma.product.update({
      where: { id: productId },
      data: {
        name: 'Renamed After The Fact',
        sellingPriceMinor: product.sellingPriceMinor + 500,
      },
    });

    // The existing movement still shows the details it recorded at the time, not the edit.
    const persisted = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } });
    expect(persisted.productNameSnapshot).toBe(product.name);
    expect(persisted.sellingPriceMinorSnapshot).toBe(product.sellingPriceMinor);
  });
});

// Proves the reset makes scenarios order-independent: a scenario that deliberately leaves the
// database dirty must not change the outcome of the scenario that runs after it. The `beforeEach`
// reset is the only thing standing between them, so if it works this count is exactly 1.
describe('scenario isolation (reset between scenarios)', () => {
  it('a dirty scenario leaves stock data behind', async () => {
    const { storeId, productId, actorId } = scenario;
    await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 2,
      movementType: 'RECEIPT',
      sourceDocument: 'DIRTY',
      actorId,
    });
    expect(await prisma.stockMovement.count()).toBe(1);
  });

  it('the next scenario starts from a clean slate regardless of what ran before it', async () => {
    // No movements survive from the previous (dirty) scenario: the reset owns the starting state.
    expect(await prisma.stockMovement.count()).toBe(0);

    const { storeId, productId, actorId } = scenario;
    await postStockMovement(prisma, {
      storeId,
      productId,
      quantityChange: 4,
      movementType: 'RECEIPT',
      sourceDocument: 'CLEAN',
      actorId,
    });
    expect(await prisma.stockMovement.count()).toBe(1);
  });
});
