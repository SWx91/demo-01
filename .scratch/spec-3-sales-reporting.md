## Problem Statement

RetailOne records sales outside any system that knows the current stock, so a sale can be recorded for goods that are not there, stock is not reduced reliably, and there is no trustworthy daily sales or stock report. Store employees need to record sales that decrease the right store's stock atomically, managers and staff need accurate reports, and everyone needs exports that open correctly in Thai spreadsheets.

## Solution

A sales-recording and reporting capability on the master-data/inventory foundation. Store employees create sales for their assigned store using active products at the current selling price (no overrides). Confirmation validates the latest stock for every line, rejects the whole document if any line is short, and otherwise records the sale and decreases stock with movement history in one transaction. Duplicate confirmation never double-posts. Reports cover daily sales, stock-on-hand, low-stock, and movement history — all filtered, permission-scoped, paginated newest-first, with CSV export that is safe for spreadsheets and correct for Thai text. Reporting days follow Asia/Bangkok.

## User Stories

1. As a store employee, I want to create a sale for my assigned store using active products and positive whole-number quantities, so that only valid sales are recorded.
2. As a store employee, I want the current selling price applied and retained in the document, with no ability to override it, so that pricing is consistent and historical.
3. As the business, I want draft sales to not reduce stock, so that only confirmed sales affect inventory.
4. As a store employee, I want confirmation to validate the latest stock for every line, so that I cannot sell what is not there.
5. As the business, I want a sale with any insufficient line rejected in full, identifying the affected products, with no partial posting, so that stock integrity holds.
6. As the business, I want successful confirmation to generate a document number, record the sale, and decrease stock with movement history in one transaction, so that the sale and stock change are consistent.
7. As a store employee, I want duplicate confirmation to never create another sale or deduct stock again, so that a retry is safe.
8. As a store employee, I want a confirmed sale viewable but not editable, cancellable, or returnable, so that sales are a permanent record.
9. As the business, I want line totals computed as quantity times unit price and summed to a document total, to two decimal places, so that money is exact.
10. As a manager or store employee, I want a daily sales report filtered by date range and store, including only confirmed sales, showing document count, units sold, and total sales amount, so that I can review trading.
11. As any user, I want a stock-on-hand and low-stock report by store with product search, where zero-stock products stay visible when they match the filter, so that nothing is hidden.
12. As any user, I want movement history filtered by product, store, movement type, and date range, with access to the source document, so that I can trace any change.
13. As a store employee, I want to see movement history for my assigned store only; as a manager, I want to see all stores, so that reporting respects permissions.
14. As any user, I want to export sales and stock reports as CSV supporting Thai text, with the same filters and permissions as the screen, so that exports match what I see.
15. As the business, I want CSV values that spreadsheets might read as formulas handled safely, so that exports cannot trigger formula injection.
16. As any user, I want a reporting day to run from 00:00:00 inclusive to the next day 00:00:00 exclusive in Asia/Bangkok, using the sale confirmation timestamp, so that day boundaries are unambiguous.
17. As any user, I want zero totals and a clear empty-state message when no records match, so that an empty report is obvious rather than broken.
18. As any user, I want lists paginated and newest-first, with loading, success, and error states, so that reports stay usable.
19. As a store employee from another store, I want a direct API request to record a sale for a store that is not mine rejected with no data change, so that permissions are enforced at the API.

## Implementation Decisions

- **New Nest feature modules**: sales and reporting under `apps/api/src/`, each implementing contract routes.
- **New contracts** `packages/contracts/src/sales.ts` and `reporting.ts`, registered in the root `contract`. Zod schemas own all input/output.
- **Prisma models**: `Sale` (number, store, actor, status, idempotency key, confirmedAt, total), `SaleLine` (product, qty, unit price captured at confirmation, line amount). Monetary values use the two-decimal representation chosen in the inventory spec (integer minor units or `Decimal`), never float.
- **Price capture**: the selling price is read from the product at confirmation and stored on the line; users cannot override it. Line amount = qty × captured unit price; document total = sum of line amounts.
- **Confirmation in one DB transaction** (reusing the inventory spec's movement mechanism): validate latest `StockBalance` for every line against the current persisted value; if any line is insufficient, reject the whole document and return the affected products (no partial posting). Otherwise allocate the sale number, write `SaleLine`s, decrease `StockBalance` with a guarded update that cannot go negative, and write `SALE` `StockMovement`s with before/after balances. All-or-nothing.
- **Idempotency**: the confirm route takes a client-supplied idempotency key with a DB unique constraint; a repeated key returns the original sale and makes no further deduction (same mechanism as receiving, carried from the design session).
- **Concurrency**: two concurrent confirmations on the same product+store cannot both succeed beyond available stock — the guarded conditional update enforces it (INV-04); exactly one succeeds, final stock is correct.
- **Reporting day boundary**: timestamps stored in UTC; report queries convert boundaries to Asia/Bangkok so a reporting day is `[00:00, next 00:00)` on the confirmation timestamp. Daily sales report counts only confirmed sales.
- **CSV export**: filters and permissions identical to the on-screen report. Cells beginning with a formula trigger (`= + - @`, plus tab/CR leading characters) are neutralized per OWASP guidance; the file is encoded UTF-8 with BOM so Thai text opens correctly in Excel. CSV export is excluded from the NFR-05 performance target.
- **Permission at the API** (NFR-01): sales restricted to a store employee whose assigned store matches the sale's store, derived from identity. Store employees see only their store in reports/movement history; managers see all stores. Audit of sales with actor, timestamp, source, outcome (NFR-03).
- **Web**: a sales-recording page (store employee) and report pages (daily sales, stock-on-hand/low-stock, movement history) with filters, pagination newest-first, CSV export buttons, loading/success/error states, zero/empty-state messaging, and Thai error messages — all via the typed `orpc` client.

## Testing Decisions

A good test asserts outcomes — the returned document, persisted stock, the rejection with affected products, the report figures, the exported bytes — not internal structure. Same three seams, confirmed with the developer:

1. **oRPC controller specs with a stubbed `PrismaService`** (prior art: `apps/api/src/health/health.controller.spec.ts`): price capture and no-override, insufficient-stock whole-document rejection with affected products (AC-05: selling 11 when stock is 10 fails, no sale/deduction), successful multi-line sale and totals (AC-06: 2×SKU001 + 1×SKU002 = THB 155.00, balances 8 and 4, resend causes no change), daily sales report figures and empty-state (AC-08: zero totals when no sales), low-stock visibility of a zero-stock product at/below threshold (AC-08: SKU003 appears), movement-history store scoping, and cross-store API rejection (AC-04 shape).
2. **Integration specs against a real Postgres (Docker)** — for the proofs a stub cannot give: idempotent replay of a confirmed sale, and two concurrent sales where exactly one succeeds and final stock is correct (AC-07: stock 10, two concurrent sales of 7, exactly one succeeds, final stock 3).
3. **Zod schema specs in `packages/contracts`** (prior art: `packages/contracts/src/auth.test.ts`): rejection of non-positive or non-whole sale quantities; CSV formula-neutralization and day-boundary helpers unit-tested (a product name beginning with `=` is neutralized; a 23:30 and a 00:30 Asia/Bangkok sale fall on different reporting days).

## Out of Scope

Master data, stock model, and the movement mechanism (master-data/inventory spec, a prerequisite). Purchase orders and receiving (sibling spec). Real payments and customer personal data. Sale editing, cancellation, or returns (Q-04: no reversals; corrections via manager adjustment). Discounts and taxes. Inventory valuation and cost of goods sold. Everything in TOR Section 3.

## Further Notes

- All screens in Thai; dates/times and reporting-day boundaries in Asia/Bangkok.
- Monetary amounts to two decimal places throughout.
- Depends on the master-data/inventory spec for `Product`, `Store`, `StockBalance`, `StockMovement`, roles, and store scoping. Independent of the purchasing/receiving spec but shares the same inventory foundation.
- NFR-05 performance target (p95 ≤ 2s for search and stock-view under 1,000 products / 10,000 movements / 10 concurrent users) is proven with a seed dataset and a load-test script in an agreed environment, recorded in the delivery package; CSV export is excluded from that target.
