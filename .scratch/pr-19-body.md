## Summary

Ticket #19: guarantee that editing master data never rewrites history. A stock movement now captures a transaction-time snapshot of the product details it recorded, so a later edit to a product's name or price leaves every existing movement faithful to what it recorded (TOR 4.3's shared "historical fidelity" rule).

- **Database** (`packages/database/prisma/schema.prisma`, `packages/database/src/stock.ts`): `StockMovement` gains `productNameSnapshot` and `sellingPriceMinorSnapshot`. `postStockMovement` reads the product's current name and price inside the same transaction that writes the balance and the movement, and stamps them onto the new row. Once written, the row is never touched again — no new mechanism needed for that, `StockMovement` was already immutable (US-13).
- **Contract** (`packages/contracts/src/stock.ts`): `StockMovementSchema` requires both snapshot fields. A new `stock.listMovements` route (`GET /stock/movements`, input `{ storeId, productId }`) is the historical-search seam AC3 needs — nothing previously listed a product's movements, only its current balance.
- **API** (`apps/api/src/stock/stock.controller.ts`): implements `listMovements` as a plain `stockMovement.findMany`, ordered oldest-first. It's a direct read of what `postStockMovement` already wrote; no join against the live `Product` row, so an edit to the product can never leak into what a past movement shows.

## What was tested

Seams match the ticket, plus the Demo line:

- **oRPC controller spec** (`apps/api/src/stock/stock.controller.spec.ts`): `post`/`adjust` return the product name and selling-price snapshot a movement recorded (AC1); `listMovements` returns a product's movement history with each row's stored snapshot untouched (AC3); the route-inventory test now also names `listMovements`.
- **Postgres integration spec** (`packages/database/src/stock.integration.spec.ts`): against a real Postgres, `postStockMovement` captures the product's name and price at posting time (AC1), and editing the product's name and price afterwards leaves the already-persisted movement row unchanged (AC2).
- **Contract schema test** (`packages/contracts/src/stock.test.ts`): `StockMovementSchema` rejects a movement missing either snapshot field or carrying a negative price snapshot; `ListStockMovementsSchema` accepts a store+product search and rejects a missing product.
- **Playwright e2e** (`apps/e2e/tests/snapshot-fidelity.e2e.ts`), the Demo line: creates its own store and product (unique SKU, per `write-e2e`'s isolation rule rather than the seeded SKU001 the Demo line names), posts an opening movement, changes the product's selling price and name through the existing edit route, then confirms `GET /stock/movements` still shows the original name and price on that movement.
- `pnpm check` (lint, typecheck, test, build — 19 tasks) and `pnpm format` pass from the repo root. `pnpm e2e` passes locally (9/9, Chromium already installed on this machine).

## Review

Sub-agent dispatch wasn't available in this unattended run (the approval prompt had no one to answer it, same precedent as tickets #17 and #18), so the two-axis review was done directly instead, covering Standards and Spec.

- **Standards**: no violation of `AGENTS.md` / `apps/api/AGENTS.md`. Contract-first flow preserved; ESM relative imports keep `.js`; database access stays through the injected `PrismaService` / the transaction client, never a new `PrismaClient`; `STOCK_MOVEMENT_SELECT` mirrors the existing `STOCK_BALANCE_SELECT`/`PRODUCT_SELECT` convention. One judgement call: `postStockMovement` reading a `Product` row inside its transaction is mild Feature Envy into another model's table, but it's required for the snapshot to be transactionally consistent with the balance/movement write, and the function already crosses `stockBalance`/`stockMovement` in one place — consistent with its existing shape, not a new pattern.
- **Spec**: all three acceptance criteria met at their named seams. The new `listMovements` route is the minimum needed to give AC3's "historical search" a seam at all (nothing previously listed movements), so it's in-scope rather than scope creep. The snapshot covers exactly what the ticket's "What to build" and acceptance criteria name — name and price — nothing added for category, unit, or SKU.

## Notes

- `US-19` in the ticket's `Covers:` line has no corresponding entry anywhere in this repo (the TOR only defines `MD-*`/`INV-*`/etc. IDs; prior tickets, e.g. #18's `US-03`, have the same gap). Not a blocker: the ticket's "What to build" and acceptance criteria are self-contained and fully actionable without it.
- `postStockMovement` now runs one extra `product.findUniqueOrThrow` per posting (to read the name/price to snapshot). Not expected to matter for the same reason noted on #18's analogous extra lookup — `post`/`adjust` aren't the endpoints NFR-05's p95 target names.

Closes #19
