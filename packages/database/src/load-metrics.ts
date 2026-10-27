/**
 * Load-test metrics (NFR-05, ticket #20). Pure functions over a list of latency samples: the only
 * number the target names is p95, so these pin exactly how it is computed and judged. No database
 * and no timing here, so they run in the `check` job; the harness that produces the samples runs
 * against Postgres.
 */

/** NFR-05's target: p95 response time at or below 2 seconds. */
export const NFR05_P95_BUDGET_MS = 2_000;

/**
 * The value at the given percentile using the nearest-rank method: sort ascending, take the value
 * at rank ceil(p/100 * n) (1-based). Nearest-rank needs no interpolation and always returns an
 * observed sample, which is what a latency report should quote. Throws on an empty sample rather
 * than inventing a number.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) {
    throw new Error('percentile requires at least one sample');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index]!;
}

/** A load-test latency summary: the shape the report prints for each endpoint. */
export interface LatencySummary {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p95Ms: number;
  /** Whether p95 is at or below the NFR-05 budget. */
  withinBudget: boolean;
}

/** Summarize a list of latency samples (milliseconds) into the report's per-endpoint figures. */
export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    throw new Error('summarizeLatencies requires at least one sample');
  }
  const total = samples.reduce((sum, ms) => sum + ms, 0);
  // Reduce rather than Math.min(...samples)/Math.max(...samples): a 5-minute run produces hundreds
  // of thousands of samples, and spreading that many arguments overflows the call stack.
  let minMs = samples[0]!;
  let maxMs = samples[0]!;
  for (const value of samples) {
    if (value < minMs) minMs = value;
    if (value > maxMs) maxMs = value;
  }
  const p95Ms = percentile(samples, 95);
  return {
    count: samples.length,
    minMs,
    maxMs,
    meanMs: total / samples.length,
    p95Ms,
    withinBudget: p95Ms <= NFR05_P95_BUDGET_MS,
  };
}
