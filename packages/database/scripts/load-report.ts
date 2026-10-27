import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../src/index.js';
import { LOAD_DATASET, seedLoadData } from '../src/load.harness.js';
import { runLoad } from '../src/load-driver.js';
import { captureMachine, renderReport, type ReportEnvironment } from '../src/load-report.js';

/**
 * The NFR-05 load-test run (ticket #20, AC3). Seeds the agreed dataset, drives 10 concurrent users
 * against search and stock-view for a continuous 5 minutes, then writes the Markdown report the
 * delivery package carries for RetailOne to approve.
 *
 * Run it in the agreed test environment, against a real Postgres with the migrations applied:
 *
 *   pnpm --filter @erp/database load:report
 *
 * Override the load from the environment for a quick smoke run (never for the delivery figure):
 *   LOAD_USERS=4 LOAD_DURATION_MS=5000 pnpm --filter @erp/database load:report
 *
 * This script resets the stock tables (it seeds its own world), so point DATABASE_URL at a
 * throwaway database, never a shared one with data worth keeping.
 */

const DEFAULT_DATABASE_URL = 'postgresql://erp:erp@localhost:5432/erp';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const DEFAULT_ENV_LABEL = 'Unlabelled test environment — set LOAD_ENV_LABEL for the delivery run';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const users = Number(process.env.LOAD_USERS ?? 10);
const durationMs = Number(process.env.LOAD_DURATION_MS ?? FIVE_MINUTES_MS);
const envLabel = process.env.LOAD_ENV_LABEL ?? DEFAULT_ENV_LABEL;

const prisma = createPrismaClient(databaseUrl);

async function main(): Promise<void> {
  // The script seeds its own world; start from a clean slate so counts are exact.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "StockMovement", "StockBalance", "StoreProduct", "Product", "Store", "User" RESTART IDENTITY CASCADE',
  );

  console.log(`Seeding ${LOAD_DATASET.products} products and ${LOAD_DATASET.movements} movements…`);
  const seed = await seedLoadData(prisma);

  console.log(`Driving ${users} users for ${durationMs} ms against search and stock-view…`);
  const result = await runLoad(prisma, { seed, users, durationMs });

  const environment: ReportEnvironment = {
    label: envLabel,
    databaseUrl,
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
