import type { PrismaClient } from './index.js';
import type { LoadSeed } from './load.harness.js';
import { type LatencySummary, summarizeLatencies } from './load-metrics.js';

/**
 * The load driver (NFR-05, ticket #20, AC2). It drives `users` simulated concurrent users against
 * the two read endpoints the target names — search and stock-view — for `durationMs`, timing every
 * request.
 *
 * The driver knows only how to drive concurrency and time requests; the two operations are
 * injected. This is what lets the proof happen at the right layer: the `load:report` script injects
 * operations that call the real HTTP APIs (`GET /products`, `GET /stock/balances`) so the measured
 * p95 is the API-level response time the target is about, while the integration spec injects
 * `prismaReadOperations` to prove the mechanism quickly without starting a server.
 *
 * CSV export is excluded from the target (ticket #20), so it is not driven here.
 */

/** One request an iteration drives. Both operations take the iteration index so each can vary its input. */
export interface LoadOperations {
  /** Drive one search request (the catalogue search API, `GET /products`). */
  search: (iteration: number) => Promise<unknown>;
  /** Drive one stock-view request (the balances API, `GET /stock/balances`). */
  stockView: (iteration: number) => Promise<unknown>;
}

export interface RunLoadOptions {
  operations: LoadOperations;
  /** How many simulated concurrent users. */
  users: number;
  /** How long to drive load, in milliseconds. */
  durationMs: number;
  /** The clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface RunLoadResult {
  users: number;
  durationMs: number;
  search: LatencySummary;
  stockView: LatencySummary;
}

/** One timed call: run it, return how many milliseconds it took. */
async function timed(now: () => number, call: () => Promise<unknown>): Promise<number> {
  const start = now();
  await call();
  return now() - start;
}

/**
 * Drive the load. Each user runs its own loop until the deadline, alternating a search and a
 * stock-view request, appending each request's latency to the shared per-endpoint arrays.
 */
export async function runLoad(options: RunLoadOptions): Promise<RunLoadResult> {
  const { operations, users, durationMs } = options;
  const now = options.now ?? Date.now;

  const searchLatencies: number[] = [];
  const stockViewLatencies: number[] = [];
  const deadline = now() + durationMs;

  const runUser = async (userIndex: number): Promise<void> => {
    let iteration = 0;
    // Guarantee at least one request of each kind per user, then keep going until the deadline.
    do {
      const seq = userIndex + iteration;
      searchLatencies.push(await timed(now, () => operations.search(seq)));
      stockViewLatencies.push(await timed(now, () => operations.stockView(seq)));
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

/** What `prismaReadOperations` needs from a Prisma client. */
type PrismaLike = Pick<PrismaClient, 'product' | 'stockBalance'>;

/** The search terms the query-layer probe rotates through, including the empty (full-scan) case. */
const PROBE_SEARCH_TERMS = ['Load', 'Beverages', 'LOAD-SKU-00001', '', 'Household'] as const;

/**
 * Operations that drive the query layer directly, issuing exactly the queries the controllers
 * issue: search is the OR over SKU/name with a case-insensitive `contains` ordered by SKU, with the
 * empty-term iteration exercising the controller's no-query full-scan path; stock-view lists the
 * store's balances. Used by the integration spec to prove the driver mechanism without a server.
 * The faithful API-level proof (through HTTP) lives in the `load:report` script.
 */
export function prismaReadOperations(prisma: PrismaLike, seed: LoadSeed): LoadOperations {
  const PRODUCT_SELECT = {
    id: true,
    sku: true,
    name: true,
    sellingPriceMinor: true,
    active: true,
  } as const;
  return {
    search: (iteration) => {
      const term = PROBE_SEARCH_TERMS[iteration % PROBE_SEARCH_TERMS.length]!;
      return prisma.product.findMany({
        where: term
          ? {
              OR: [
                { sku: { contains: term, mode: 'insensitive' as const } },
                { name: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {},
        orderBy: { sku: 'asc' },
        select: PRODUCT_SELECT,
      });
    },
    stockView: () =>
      prisma.stockBalance.findMany({
        where: { storeId: seed.storeId },
        select: { storeId: true, productId: true, quantity: true },
      }),
  };
}
