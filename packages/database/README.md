# @erp/database

Prisma schema, migrations, seed, and the generated client for the ERP. See the repo
[AGENTS.md](../../AGENTS.md) for the monorepo rules.

## Postgres integration test harness

The inventory invariants are storage-layer guarantees, not application logic, so they are proven
against a **real Postgres**, not a stubbed client:

- **INV-03** — a balance can never go negative, and a posting commits its balance change and its
  movement together or not at all.
- **INV-04** — two concurrent postings to the same product and store never lose an update.

These live in the `*.integration.spec.ts` files and run on the harness in
[`src/stock.integration.harness.ts`](src/stock.integration.harness.ts). The harness owns one shared
Prisma client, resets the stock tables between scenarios, and seeds each scenario its own world, so
scenarios pass in any order.

### Setup

A real Postgres must be reachable at `DATABASE_URL` (default
`postgresql://erp:erp@localhost:5432/erp`) with the migrations applied.

```bash
pnpm docker:up      # start the repo's Postgres (and the rest of the stack)
pnpm db:deploy      # apply migrations
pnpm db:generate    # Prisma 7 does not generate on install; the specs import the client
```

### Run

```bash
pnpm --filter @erp/database test:integration
```

The suite is single-threaded (`fileParallelism: false` in
[`vitest.integration.config.ts`](vitest.integration.config.ts)) so the concurrency scenario owns the
database for its race. CI runs this in the `e2e` job, where a Postgres service exists — the `check`
job has no database, so these specs do not run there.

### Reset and teardown

Each scenario calls `resetStockData()` in a `beforeEach`, which truncates the stock tables and the
store/user/product fixtures the harness seeds, in FK-safe order. It then builds only the world it
needs with `seedScenario()`. The reset — not test ordering — owns each scenario's starting state, so
no scenario depends on another's outcome. Close the shared connection once with
`disconnectHarness()` in an `afterAll`.
