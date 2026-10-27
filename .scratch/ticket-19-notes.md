# Ticket #19 — Historical snapshot fidelity — working notes

Branch: ticket/19-historical-snapshot-fidelity (already checked out, stay on it)

## Ticket

Covers: MD shared rule (historical fidelity); US-19 (US-19 undefined in TOR, same as #18's
precedent — not a blocker, ACs are self-contained)
Demo: change SKU001's selling price; an existing movement still shows the details recorded at the time
Seams: oRPC controller spec; Postgres integration spec
(+ Playwright e2e for the Demo line, per implement-ticket skill rule)

TOR 4.3 shared rule: "Changes to master data must not alter the names, prices, or details
recorded in historical documents. Store transaction-time snapshots for audit purposes."

## Design

- Prisma: add `productNameSnapshot String` and `sellingPriceMinorSnapshot Int` to StockMovement.
- `postStockMovement` (packages/database/src/stock.ts): read the product's current name/price
  inside the same transaction, write them as snapshot fields on the created movement.
- Contract (packages/contracts/src/stock.ts): StockMovementSchema gains the two snapshot fields.
  New route `stock.listMovements` (GET /stock/movements, input {storeId, productId}) so a
  "historical search" seam exists (AC3) — nothing previously listed movements, only balances.
- API (apps/api/src/stock/stock.controller.ts): add `listMovements` handler, extend select set.
- Tests:
  - packages/contracts/src/stock.test.ts: schema accepts/requires snapshot fields.
  - apps/api/src/stock/stock.controller.spec.ts: post/adjust return snapshot fields (AC1);
    listMovements returns stored snapshot rows uncorrupted (AC3).
  - packages/database/src/stock.integration.spec.ts: real Postgres — snapshot captured at
    posting time; editing the product's name/price afterward does not change the persisted
    movement row (AC2).
  - apps/e2e/tests/snapshot-fidelity.e2e.ts: Demo line, API-driven (no UI for movement history
    yet, same pattern as stock.e2e.ts / sku-immutability.e2e.ts).

## Status log

- [ ] Prisma schema + migration
- [ ] database layer + integration spec
- [ ] contracts + contract test
- [ ] api controller + controller spec
- [ ] e2e test
- [ ] pnpm check / format
- [ ] code-review vs main
- [ ] push + PR
