import { createPrismaClient, type PrismaClient } from './index.js';

/**
 * The Postgres integration harness (ticket #14).
 *
 * The inventory invariants (INV-03 non-negative balance, INV-04 no lost update) are storage-layer
 * guarantees, so they can only be proven against a real Postgres. This module is the harness the
 * invariant specs run on. It owns one shared Prisma client, resets the stock tables between
 * scenarios so no scenario depends on another's outcome, and seeds each scenario its own world.
 *
 * ## Setup / teardown / run
 *
 * - **Setup:** a real Postgres must be reachable at `DATABASE_URL` (defaults to the repo's Docker
 *   Postgres, `postgresql://erp:erp@localhost:5432/erp`) with the migrations applied
 *   (`pnpm db:deploy`). Locally, `pnpm docker:up` provides it.
 * - **Reset:** each scenario calls `resetStockData()` in a `beforeEach`, which truncates the stock
 *   tables and the fixtures this harness creates, in FK-safe order. A scenario then builds only the
 *   world it needs via `seedScenario()`, so scenarios pass in any order.
 * - **Teardown:** call `disconnectHarness()` in an `afterAll` to close the shared connection.
 * - **Run:** `pnpm --filter @erp/database test:integration`. CI runs it in the `e2e` job, where a
 *   Postgres service exists (the `check` job has no database).
 */

const DEFAULT_DATABASE_URL = 'postgresql://erp:erp@localhost:5432/erp';

/** The single Prisma client the whole integration suite shares. */
export const prisma: PrismaClient = createPrismaClient(
  process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
);

/**
 * Everything this harness and its scenarios write: stock movements and balances, and the store,
 * user and product fixtures each scenario seeds. Truncating all of it, with `CASCADE` and the
 * identity restarted, returns the database to a clean slate between scenarios regardless of order.
 * Stock movements are immutable to the application (US-13: UPDATE and DELETE are blocked by the
 * database), but `TRUNCATE` is a table-level operation the harness owns, distinct from the row-level
 * writes the invariant forbids.
 */
export async function resetStockData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "StockMovement", "StockBalance", "StoreProduct", "Product", "Store", "User" RESTART IDENTITY CASCADE',
  );
}

let seedSeq = 0;

/** A scenario's own world: a store, an actor, a product and that product's opening balance. */
export interface Scenario {
  storeId: string;
  actorId: string;
  productId: string;
}

/**
 * Seed one scenario's own store, actor and product, with the product's balance opened at `opening`.
 * Call it after `resetStockData()`. Every scenario gets distinct identifiers so a scenario never
 * reads another's rows even within a single reset window.
 */
export async function seedScenario(opening = 10): Promise<Scenario> {
  const tag = `itest-${seedSeq++}`;
  const store = await prisma.store.create({
    data: { code: `${tag}-S`, name: 'Integration Store' },
  });
  const actor = await prisma.user.create({
    data: { email: `${tag}@test.local`, name: 'Integration Actor', passwordHash: 'x' },
  });
  const product = await prisma.product.create({
    data: {
      sku: `${tag}-SKU`,
      name: 'Integration Product',
      category: 'Test',
      unit: 'unit',
      sellingPriceMinor: 100,
    },
  });
  await prisma.stockBalance.create({
    data: { storeId: store.id, productId: product.id, quantity: opening, version: 0 },
  });
  return { storeId: store.id, actorId: actor.id, productId: product.id };
}

/** Close the shared connection. Call once in an `afterAll`. */
export async function disconnectHarness(): Promise<void> {
  await prisma.$disconnect();
}
