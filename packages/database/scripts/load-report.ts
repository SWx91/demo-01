import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, hashPassword, Role } from '../src/index.js';
import { LOAD_DATASET, seedLoadData } from '../src/load.harness.js';
import { type LoadOperations, runLoad } from '../src/load-driver.js';
import { captureMachine, renderReport, type ReportEnvironment } from '../src/load-report.js';

/**
 * The NFR-05 load-test run (ticket #20, AC3). Seeds the agreed dataset, then drives 10 concurrent
 * users against the real search and stock-view HTTP APIs for a continuous 5 minutes, and writes the
 * Markdown report the delivery package carries for RetailOne to approve.
 *
 * Unlike the integration spec (which probes the query layer to prove the mechanism), this script
 * drives the running API over HTTP — `GET /api/products` and `GET /api/stock/balances` — so the
 * p95 it records is the API-level response time the target is about: HTTP, oRPC, the auth guard and
 * JSON serialization included.
 *
 * Run it in the agreed test environment against the running API and its Postgres:
 *
 *   # API pointed at the same DATABASE_URL this script seeds
 *   LOAD_API_URL=http://localhost:3000 LOAD_ENV_LABEL="..." \
 *     pnpm --filter @erp/database load:report
 *
 * Quick smoke run (never the delivery figure):
 *   LOAD_USERS=4 LOAD_DURATION_MS=5000 ... pnpm --filter @erp/database load:report
 *
 * This script resets the stock tables (it seeds its own world), so point DATABASE_URL (and the
 * API) at a throwaway database, never a shared one with data worth keeping.
 */

const DEFAULT_DATABASE_URL = 'postgresql://erp:erp@localhost:5432/erp';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const DEFAULT_ENV_LABEL = 'Unlabelled test environment — set LOAD_ENV_LABEL for the delivery run';
const LOAD_ADMIN_EMAIL = 'load-admin@erp.local';
const LOAD_ADMIN_PASSWORD = 'load-password';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const apiUrl = (process.env.LOAD_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const users = Number(process.env.LOAD_USERS ?? 10);
const durationMs = Number(process.env.LOAD_DURATION_MS ?? FIVE_MINUTES_MS);
const envLabel = process.env.LOAD_ENV_LABEL ?? DEFAULT_ENV_LABEL;

const prisma = createPrismaClient(databaseUrl);

/** The search terms the HTTP probe rotates through, including the empty (full-scan) case. */
const SEARCH_TERMS = ['Load', 'Beverages', 'LOAD-SKU-00001', '', 'Household'];

/** Log in over HTTP and return the session cookie the API set. */
async function login(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: LOAD_ADMIN_EMAIL, password: LOAD_ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Login to ${apiUrl} returned ${res.status}. Is the API running and pointed at DATABASE_URL?`,
    );
  }
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('Login did not set a session cookie');
  return cookie.split(';')[0]!;
}

/** Operations that drive the real HTTP endpoints, so the measured latency is the API's own. */
function httpReadOperations(cookie: string, storeId: string): LoadOperations {
  const get = async (pathAndQuery: string): Promise<void> => {
    const res = await fetch(`${apiUrl}/api${pathAndQuery}`, { headers: { cookie } });
    if (!res.ok) throw new Error(`GET ${pathAndQuery} returned ${res.status}`);
    await res.json();
  };
  return {
    search: (iteration) => {
      const term = SEARCH_TERMS[iteration % SEARCH_TERMS.length]!;
      return get(`/products?query=${encodeURIComponent(term)}`);
    },
    stockView: () => get(`/stock/balances?storeId=${encodeURIComponent(storeId)}`),
  };
}

async function main(): Promise<void> {
  // The script seeds its own world; start from a clean slate so counts are exact.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "StockMovement", "StockBalance", "StoreProduct", "Product", "Store", "User" RESTART IDENTITY CASCADE',
  );

  console.log(`Seeding ${LOAD_DATASET.products} products and ${LOAD_DATASET.movements} movements…`);
  const seed = await seedLoadData(prisma);

  // A user the HTTP probe can log in as. The seed's own actor has no real password hash.
  await prisma.user.create({
    data: {
      email: LOAD_ADMIN_EMAIL,
      name: 'Load Admin',
      role: Role.ADMINISTRATOR,
      passwordHash: await hashPassword(LOAD_ADMIN_PASSWORD),
    },
  });

  console.log(`Logging in to ${apiUrl} and driving ${users} users for ${durationMs} ms…`);
  const cookie = await login();
  const result = await runLoad({
    operations: httpReadOperations(cookie, seed.storeId),
    users,
    durationMs,
  });

  const environment: ReportEnvironment = {
    label: envLabel,
    databaseUrl,
    apiUrl,
    dataset: { products: LOAD_DATASET.products, movements: LOAD_DATASET.movements },
    ranAt: new Date().toISOString(),
  };
  const markdown = renderReport(result, environment, captureMachine());

  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'load-test');
  const outFile = path.join(outDir, 'report.md');
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, markdown, 'utf8');

  console.log(markdown);
  console.log(`\nReport written to ${outFile}`);
  console.log(
    result.search.withinBudget && result.stockView.withinBudget ? 'NFR-05: PASS' : 'NFR-05: FAIL',
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
