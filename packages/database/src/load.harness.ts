import type { MovementType } from './generated/prisma/client.js';
import type { PrismaClient } from './index.js';

/**
 * The load dataset (NFR-05, ticket #20). The performance target is proven against a real Postgres
 * seeded to the size the TOR names: 1,000 products and 10,000 movements. Both the `seedLoadData`
 * integration spec and the `load:report` script seed exactly this.
 */
export const LOAD_DATASET = {
  products: 1_000,
  movements: 10_000,
} as const;

/** What a `PrismaClient` needs to expose for the load seed — the real client or the shared harness one. */
type PrismaLike = Pick<
  PrismaClient,
  'store' | 'user' | 'product' | 'stockBalance' | 'stockMovement'
>;

/** The outcome of one load seed: the counts it created and the store its stock-view reads run against. */
export interface LoadSeed {
  storeId: string;
  actorId: string;
  productCount: number;
  movementCount: number;
}

/** Insert in batches so a single `createMany` never carries all 10,000 rows at once. */
const BATCH_SIZE = 1_000;

async function createInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await insert(rows.slice(start, start + BATCH_SIZE));
  }
}

/**
 * Seed the agreed load dataset: one store, one actor, 1,000 products each with an opening balance,
 * and 10,000 movements spread evenly across the products. Every movement is a RECEIPT that raises
 * the balance, so the running balance is monotonic and never negative (INV-03) — the point of the
 * seed is a realistic read workload for search and stock-view, not to exercise the posting rules.
 *
 * The movement's `balanceBefore`/`balanceAfter` and the product name/price snapshot are computed
 * here exactly as `postStockMovement` would, so the stock-view read sees consistent rows. Bulk
 * `createMany` keeps the 10,000-row insert fast enough to run before each load report.
 *
 * Call after `resetStockData()`. Returns the store the stock-view reads should target and the
 * counts it created.
 */
export async function seedLoadData(prisma: PrismaLike): Promise<LoadSeed> {
  const store = await prisma.store.create({
    data: { code: `load-${Date.now()}-S`, name: 'Load Test Store' },
  });
  const actor = await prisma.user.create({
    data: { email: `load-${Date.now()}@test.local`, name: 'Load Actor', passwordHash: 'x' },
  });

  const { products: productTarget, movements: movementTarget } = LOAD_DATASET;

  // 1,000 products, each priced distinctly so a snapshot is meaningful.
  const productRows = Array.from({ length: productTarget }, (_, i) => ({
    sku: `LOAD-SKU-${i.toString().padStart(5, '0')}`,
    name: `Load Product ${i}`,
    category: i % 2 === 0 ? 'Beverages' : 'Household',
    unit: 'unit',
    sellingPriceMinor: 1_000 + i,
  }));
  await createInBatches(productRows, (batch) => prisma.product.createMany({ data: batch }));
  const products = await prisma.product.findMany({
    where: { sku: { startsWith: 'LOAD-SKU-' } },
    select: { id: true, name: true, sellingPriceMinor: true },
    orderBy: { sku: 'asc' },
  });

  // Each product opens at a balance high enough that spreading the movements across it never
  // drives it negative. Movements are spread round-robin, so a product gets at most
  // ceil(movements / products) of them.
  const perProduct = Math.ceil(movementTarget / productTarget);
  const opening = perProduct; // each RECEIPT adds 1; opening at `perProduct` keeps balances whole and positive.

  await createInBatches(
    products.map((p) => ({ storeId: store.id, productId: p.id, quantity: opening })),
    (batch) => prisma.stockBalance.createMany({ data: batch }),
  );

  // 10,000 movements spread evenly over the products. A movement is the i-th RECEIPT on its
  // product, so its before/after balance follows from the opening balance and that index.
  const movementRows: {
    storeId: string;
    productId: string;
    quantityChange: number;
    balanceBefore: number;
    balanceAfter: number;
    movementType: MovementType;
    sourceDocument: string;
    productNameSnapshot: string;
    sellingPriceMinorSnapshot: number;
    actorId: string;
  }[] = [];
  const indexByProduct = new Map<string, number>();
  for (let m = 0; m < movementTarget; m++) {
    const product = products[m % products.length]!;
    const nth = indexByProduct.get(product.id) ?? 0;
    indexByProduct.set(product.id, nth + 1);
    const balanceBefore = opening + nth;
    movementRows.push({
      storeId: store.id,
      productId: product.id,
      quantityChange: 1,
      balanceBefore,
      balanceAfter: balanceBefore + 1,
      movementType: 'RECEIPT',
      sourceDocument: `LOAD-PO-${m}`,
      productNameSnapshot: product.name,
      sellingPriceMinorSnapshot: product.sellingPriceMinor,
      actorId: actor.id,
    });
  }
  await createInBatches(movementRows, (batch) => prisma.stockMovement.createMany({ data: batch }));

  // Advance each balance to reflect the movements posted against it.
  await createInBatches(
    products.map((p) => p.id),
    async (batch) => {
      await Promise.all(
        batch.map((productId) =>
          prisma.stockBalance.update({
            where: { storeId_productId: { storeId: store.id, productId } },
            data: { quantity: opening + (indexByProduct.get(productId) ?? 0) },
          }),
        ),
      );
    },
  );

  return {
    storeId: store.id,
    actorId: actor.id,
    productCount: products.length,
    movementCount: movementTarget,
  };
}
