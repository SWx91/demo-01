import { describe, expect, it } from 'vitest';
import { NFR05_P95_BUDGET_MS, percentile, summarizeLatencies } from './load-metrics.js';

// NFR-05 (ticket #20): the metric the whole load test exists to record is p95 latency. These are
// pure, so they run in the `check` job (no database) and pin the one number the report reports.
describe('percentile (nearest-rank)', () => {
  it('takes the value at the nearest rank, worked by hand', () => {
    // 1..100: nearest-rank p95 is rank ceil(0.95 * 100) = 95, the 95th value = 95.
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(samples, 95)).toBe(95);
  });

  it('rounds the rank up on a small sample', () => {
    // 5 values: rank ceil(0.95 * 5) = ceil(4.75) = 5, the 5th value = 50.
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
  });

  it('sorts before ranking, so input order does not matter', () => {
    expect(percentile([50, 10, 40, 20, 30], 95)).toBe(50);
  });

  it('returns the only value for a single sample', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it('throws on an empty sample rather than inventing a number', () => {
    expect(() => percentile([], 95)).toThrow();
  });
});

describe('summarizeLatencies', () => {
  it('reports count, min, max, mean and p95 from a worked example', () => {
    // Ten samples 10..100. p95: rank ceil(0.95 * 10) = 10, the 10th value = 100.
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const summary = summarizeLatencies(samples);

    expect(summary.count).toBe(10);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(100);
    expect(summary.meanMs).toBe(55); // (10+...+100)/10 = 550/10
    expect(summary.p95Ms).toBe(100);
  });

  it('flags a p95 within the NFR-05 budget as a pass', () => {
    const summary = summarizeLatencies([100, 200, 300]);
    expect(summary.p95Ms).toBeLessThanOrEqual(NFR05_P95_BUDGET_MS);
    expect(summary.withinBudget).toBe(true);
  });

  it('flags a p95 over the NFR-05 budget as a fail', () => {
    const overBudget = NFR05_P95_BUDGET_MS + 1;
    const summary = summarizeLatencies([overBudget, overBudget, overBudget]);
    expect(summary.withinBudget).toBe(false);
  });

  it('exposes the NFR-05 budget as 2 seconds', () => {
    expect(NFR05_P95_BUDGET_MS).toBe(2_000);
  });

  it('summarizes a very large sample without overflowing the stack', () => {
    // A 5-minute, 10-user run produces hundreds of thousands of samples. Math.min(...samples)
    // overflows the call stack at that size; summarize must handle it.
    const samples = Array.from({ length: 500_000 }, (_, i) => (i % 1_000) + 1);
    const summary = summarizeLatencies(samples);
    expect(summary.count).toBe(500_000);
    expect(summary.minMs).toBe(1);
    expect(summary.maxMs).toBe(1_000);
  });
});
