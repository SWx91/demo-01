import { describe, expect, it } from 'vitest';
import type { RunLoadResult } from './load-driver.js';
import {
  type MachineInfo,
  type ReportEnvironment,
  redactDatabaseUrl,
  renderReport,
} from './load-report.js';
import { summarizeLatencies } from './load-metrics.js';

// NFR-05 (ticket #20): the report rendering, AC3. Pure, so it runs in the `check` job. Two things
// matter here and are easy to get wrong: the credential in the database URL must never reach the
// report, and the pass/fail verdict must follow the 2-second budget.

const machine: MachineInfo = {
  platform: 'linux',
  release: '6.0.0',
  arch: 'x64',
  cpuModel: 'Test CPU',
  cpuCount: 4,
  totalMemoryGb: 16,
  nodeVersion: 'v24.0.0',
};

const environment: ReportEnvironment = {
  label: 'Docker Postgres 18',
  databaseUrl: 'postgresql://erp:erp@localhost:5432/erp',
  dataset: { products: 1000, movements: 10000 },
  ranAt: '2026-10-27T00:00:00.000Z',
};

describe('redactDatabaseUrl', () => {
  it('removes the password so it never reaches the report', () => {
    const redacted = redactDatabaseUrl('postgresql://erp:secret@db:5432/erp');
    expect(redacted).not.toContain('secret');
    expect(redacted).toContain('***');
    expect(redacted).toContain('db:5432/erp');
  });

  it('leaves a URL with no password alone', () => {
    expect(redactDatabaseUrl('postgresql://db:5432/erp')).toContain('db:5432/erp');
  });
});

describe('renderReport', () => {
  it('reports PASS and the p95 figures when both endpoints are within budget', () => {
    const result: RunLoadResult = {
      users: 10,
      durationMs: 300_000,
      search: summarizeLatencies([100, 150, 200]),
      stockView: summarizeLatencies([120, 180, 240]),
    };

    const md = renderReport(result, environment, machine);

    expect(md).toContain('✅ PASS');
    expect(md).toContain('10 concurrent users');
    expect(md).toContain('1,000 products, 10,000 movements');
    expect(md).toContain('Search (GET /products)');
    expect(md).toContain('Stock-view (GET /stock/balances)');
    // The credential never appears, even though the environment carried one.
    expect(md).not.toContain(':erp@');
    expect(md).toContain('Test CPU');
  });

  it('reports FAIL when an endpoint exceeds the 2-second budget', () => {
    const result: RunLoadResult = {
      users: 10,
      durationMs: 300_000,
      search: summarizeLatencies([2_500]),
      stockView: summarizeLatencies([100]),
    };

    const md = renderReport(result, environment, machine);
    expect(md).toContain('❌ FAIL');
  });
});
