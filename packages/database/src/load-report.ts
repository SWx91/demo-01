import os from 'node:os';
import type { LatencySummary } from './load-metrics.js';
import { NFR05_P95_BUDGET_MS } from './load-metrics.js';
import type { RunLoadResult } from './load-driver.js';

/**
 * The load-test report (NFR-05, ticket #20, AC3). Turns a `runLoad` result into the Markdown the
 * delivery package carries for RetailOne to approve: the p95 figures for search and stock-view,
 * the verdict against the 2-second budget, the load that was driven, the dataset, and the
 * environment and machine the run happened on.
 */

export interface ReportEnvironment {
  /** A human label for the agreed test environment (e.g. "Docker Postgres 18 on the CI runner"). */
  label: string;
  /** The database the run targeted, with any credentials stripped. */
  databaseUrl: string;
  /** The API base URL the HTTP probe drove. */
  apiUrl: string;
  /** The dataset size the seed produced. */
  dataset: { products: number; movements: number };
  /** When the run finished (ISO). */
  ranAt: string;
}

/** Everything a machine snapshot needs; captured with `captureMachine()` by default. */
export interface MachineInfo {
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryGb: number;
  nodeVersion: string;
}

/** Snapshot the machine the report is generated on. */
export function captureMachine(): MachineInfo {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model.trim() ?? 'unknown',
    cpuCount: cpus.length,
    totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    nodeVersion: process.version,
  };
}

/** Strip the password from a Postgres URL so the report never carries a credential. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

function verdict(summary: LatencySummary): string {
  return summary.withinBudget ? '✅ within budget' : '❌ over budget';
}

function endpointRow(name: string, summary: LatencySummary): string {
  return (
    `| ${name} | ${summary.count} | ${ms(summary.minMs)} | ${ms(summary.meanMs)} | ` +
    `**${ms(summary.p95Ms)}** | ${ms(summary.maxMs)} | ${verdict(summary)} |`
  );
}

/** Render the Markdown report for a completed load run. */
export function renderReport(
  result: RunLoadResult,
  environment: ReportEnvironment,
  machine: MachineInfo,
): string {
  const overallPass = result.search.withinBudget && result.stockView.withinBudget;
  const minutes = Math.round((result.durationMs / 60_000) * 10) / 10;

  return `# NFR-05 load-test report

**Target:** p95 response time at or below ${NFR05_P95_BUDGET_MS / 1000} seconds for search and stock-view, under 10 concurrent users for 5 continuous minutes (CSV export excluded).

**Result:** ${overallPass ? '✅ PASS' : '❌ FAIL'} — p95 for both endpoints is ${overallPass ? 'at or below' : 'compared against'} the ${NFR05_P95_BUDGET_MS / 1000} s budget.

## Load

- Concurrent users: ${result.users}
- Duration: ${minutes} minute(s) (${result.durationMs} ms)
- Dataset: ${environment.dataset.products.toLocaleString()} products, ${environment.dataset.movements.toLocaleString()} movements

## Latency by endpoint

Measured at the HTTP API (\`${environment.apiUrl}/api\`): each request is a real call through oRPC, the auth guard and JSON serialization, not a direct database query.

| Endpoint | Requests | min | mean | p95 | max | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
${endpointRow('Search (GET /products)', result.search)}
${endpointRow('Stock-view (GET /stock/balances)', result.stockView)}

## Environment (for RetailOne approval)

- Environment: ${environment.label}
- API: ${environment.apiUrl}
- Database: \`${redactDatabaseUrl(environment.databaseUrl)}\`
- Run finished: ${environment.ranAt}

## Machine

- OS: ${machine.platform} ${machine.release} (${machine.arch})
- CPU: ${machine.cpuModel} × ${machine.cpuCount}
- Memory: ${machine.totalMemoryGb} GB
- Node: ${machine.nodeVersion}
`;
}
