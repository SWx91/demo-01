import type { PrismaClient } from './index.js';
import type { LoadSeed } from './load.harness.js';
import { type LatencySummary, summarizeLatencies } from './load-metrics.js';

/**
 * The load driver (NFR-05, ticket #20, AC2). It drives `users` simulated concurrent users against
 * the two read endpoints the target names — search (`GET /products`) and stock-view
 * (`GET /stock/balances`) — for `durationMs`, timing every request. It issues exactly the queries
 * the API controllers issue (same `where`/`orderBy`/`select` shape), so the latency it measures is
 * the endpoints' own database work, isolated from HTTP and auth.
 *
 * CSV export is excluded from the target (ticket #20), so it is not driven here.
 */

/** What the driver needs from a Prisma client: the two read queries, nothing else. */
type PrismaLike = Pick<PrismaClient, 'product' | 'stockBalance'>;

export interface RunLoadOptions {
  /** The seeded world to read against (its store is the stock-view target). */
  seed: LoadSeed;
  /** How many simulated concurrent users. */
  users: number;
  /** How long to drive load, in milliseconds. */
  durationMs: number;
  /** A few search terms to rotate through; defaults to realistic catalogue substrings. */
  searchTerms?: readonly string[];
  /** The clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface RunLoadResult {
  users: number;
  durationMs: number;
  search: LatencySummary;
  stockView: LatencySummary;
}

const DEFAULT_SEARCH_TERMS = ['Load', 'Product', 'LOAD-SKU-0001', 'Beverages', 'Household'] as const;

/** One timed query: run it, return how many milliseconds it took. */
async function timed(now: () => number, query: () => Promise<unknown>): Promise<number> {
  const start = now();
  await query();
  return now() - start;
}

/**
 * Drive the load. Each user runs its own loop until the deadline, alternating a search and a
 * stock-view read, appending each request's latency to the shared per-endpoint arrays. The reads
 * mirror the controllers: search is an OR over SKU/name with a case-insensitive `contains` ordered
 * by SKU; stock-view lists the store's balances.
 */
export async function runLoad(
  prisma: PrismaLike,
  options: RunLoadOptions,
): Promise<RunLoadResult> {
  const { seed, users, durationMs } = options;
  const now = options.now ?? Date.now;
  const searchTerms = options.searchTerms ?? DEFAULT_SEARCH_TERMS;

  const searchLatencies: number[] = [];
  const stockViewLatencies: number[] = [];
  const deadline = now() + durationMs;

  const runUser = async (userIndex: number): Promise<void> => {
    let iteration = 0;
    // Guarantee at least one request of each kind per user, then keep going until the deadline.
    do {
      const term = searchTerms[(userIndex + iteration) % searchTerms.length]!;
      searchLatencies.push(
        await timed(now, () =>
          prisma.product.findMany({
            where: {
              OR: [
                { sku: { contains: term, mode: 'insensitive' as const } },
                { name: { contains: term, mode: 'insensitive' as const } },
              ],
            },
            orderBy: { sku: 'asc' },
            select: { id: true, sku: true, name: true, sellingPriceMinor: true, active: true },
          }),
        ),
      );
      stockViewLatencies.push(
        await timed(now, () =>
          prisma.stockBalance.findMany({
            where: { storeId: seed.storeId },
            select: { storeId: true, productId: true, quantity: true },
          }),
        ),
      );
      iteration++;
    } while (now() < deadline);
  };

  await Promise.all(Array.from({ length: users }, (_, i) => runUser(i)));

  return {
    users,
    durationMs,
    search: summarizeLatencies(searchLatencies),
    stockView: summarizeLatencies(stockViewLatencies),
  };
}
