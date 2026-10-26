## Problem Statement

RetailOne keeps product records, stock balances, stores, and suppliers in separate files across a head office and two stores. Stock checks are slow and goods get received twice because no single system holds the authoritative master data or an auditable record of every stock change. Staff and managers cannot trust the current stock figure for a product in a given store.

## Solution

A master-data and inventory foundation inside the ERP web app: one organization, Thai baht, one base unit per SKU, stock tracked per store. Administrators manage users, stores, products, and suppliers. Everyone can search stock and see low-stock status per store. Every increase or decrease in stock is written as an immutable movement with before/after balances, actor, timestamp, type, and source document, so the balance is always `opening + successful movements` and never negative. Managers can correct stock with a mandatory reason. This spec is the foundation the purchasing/receiving and sales/reporting specs build on.

## User Stories

1. As an administrator, I want to create and edit products with SKU, name, category, unit, selling price, active status, and a per-store reorder threshold, so that the catalogue is maintained in one place.
2. As an administrator, I want SKUs to be unique across the organization, so that two products can never collide.
3. As an administrator, I want a product's SKU to be frozen once any transaction references it, so that history stays coherent.
4. As an administrator, I want selling prices and reorder thresholds rejected when negative, so that invalid master data never enters the system.
5. As an administrator, I want stock quantities constrained to whole numbers, so that fractional stock is impossible.
6. As an administrator, I want to deactivate a product while keeping it searchable in historical records, so that discontinued goods stay auditable.
7. As a purchasing officer or store employee, I want inactive products blocked from new documents, so that I cannot order or sell discontinued goods.
8. As an administrator, I want to maintain store codes and names, so that each store is identified consistently.
9. As an administrator, I want to maintain supplier codes, names, and contact details, so that purchasing has a supplier directory.
10. As any signed-in user, I want to search stock by SKU, product name, and store, so that I can find a balance quickly.
11. As any signed-in user, I want the stock view to show current quantity, unit, reorder threshold, and a low-stock flag when quantity is at or below the threshold, so that I can see what needs reordering.
12. As an auditor, I want every stock increase or decrease to record product, store, quantity change, before and after balances, movement type, source document, actor, and timestamp, so that movements are fully traceable.
13. As an auditor, I want confirmed movements to be immutable, so that history cannot be rewritten.
14. As the business, I want stock balances to equal opening balances plus successful movements and never go negative, so that the figure is always trustworthy.
15. As the business, I want document posting and the stock update to commit together or roll back together, so that a half-applied change is impossible.
16. As the business, I want concurrent transactions on the same product and store to never lose an update, so that two simultaneous actions cannot corrupt the balance.
17. As a manager, I want to increase or decrease stock with a mandatory reason recorded in movement history, so that corrections are authorized and auditable.
18. As a manager, I want a stock reduction larger than the available balance rejected, so that I cannot drive stock negative.
19. As the business, I want changes to master data to never alter names, prices, or details already recorded in historical documents, so that past documents stay faithful.
20. As any user, I want lists paginated and ordered newest-first, with loading, success, and error states, so that large data sets stay usable.
21. As a store employee, I want to see and search stock only for my assigned store, so that permissions match my role; managers see all stores.

## Implementation Decisions

- **Roles.** Extend the domain to the four TOR roles — Administrator, Purchasing officer, Store employee, Manager. The starter `Role` enum (`ADMIN | STAFF`) must grow to cover these. Store employees are scoped to one store; the user-store association lives in the data model, and store scope is derived from the signed-in user's identity, never from request input.
- **New Nest feature modules** under `apps/api/src/<feature>/`, one per area: products, stores, suppliers, inventory. Each implements contract routes via `@Implement`.
- **New contracts** in `packages/contracts/src/` (e.g. `products.ts`, `stores.ts`, `suppliers.ts`, `inventory.ts`), registered in the root `contract` object. Zod schemas are the single source of truth for every input and output; the apps derive types with `z.infer`.
- **Prisma models** in `packages/database/prisma/schema.prisma`: `Store`, `Supplier`, `Product`, per-store `ReorderThreshold` (or a store-scoped stock row carrying it), `StockBalance` (product + store + quantity), and `StockMovement` (product, store, quantityChange, balanceBefore, balanceAfter, movementType, sourceDocument reference, actor, createdAt). A `MovementType` enum covers at least `RECEIPT`, `SALE`, `ADJUSTMENT`. Monetary fields use a two-decimal representation that avoids floating-point drift (integer minor units or `Decimal`).
- **SKU immutability** enforced in the products handler: once a `StockMovement` or any document references a product, its SKU cannot change. Uniqueness enforced by a DB unique constraint.
- **Invariants at the database.** Non-negative balance and lost-update prevention are enforced at the DB inside a transaction (atomic conditional update guarded by the current balance, or a version column), not only in application code. Posting a document, updating the balance, and writing the movement happen in one transaction — all-or-nothing.
- **Manager adjustment** is an inventory route restricted to the Manager role, requiring a non-empty reason, writing an `ADJUSTMENT` movement, and rejecting reductions beyond the available balance.
- **Permission enforced at the API** for every request (role and store), per NFR-01. Store scope comes from the user record. Audit of adjustments (actor, timestamp, source, outcome) per NFR-03.
- **Validation in both layers** (NFR-04): the contract's Zod schemas reject negative prices/thresholds and non-whole quantities; the API re-validates business invariants against the latest persisted state.
- **Web**: new pages under the authenticated layout for product/store/supplier management (Administrator) and stock search (all roles), talking to the API only through the typed `orpc` client.

## Testing Decisions

A good test asserts externally observable behavior — the result of a contract call, the persisted balance, the rejection — not internal structure. Three seams, confirmed with the developer:

1. **oRPC controller specs with a stubbed `PrismaService`** (prior art: `apps/api/src/health/health.controller.spec.ts`, using `call()` from `@orpc/server`). Covers master-data rules, SKU immutability, inactive-product blocking, low-stock flagging, manager-adjustment authorization and reason requirement, and store-scoped permission (a store employee reaching another store's data is rejected with no data change — the AC-04 shape).
2. **Integration specs against a real Postgres (Docker)** — used only for what a stub cannot honestly prove: the non-negative-balance invariant, all-or-nothing transaction rollback (INV-03), and concurrent updates on one product+store not losing an update (INV-04). These assert the final persisted balance after simultaneous requests.
3. **Zod schema specs in `packages/contracts`** (prior art: `packages/contracts/src/auth.test.ts`). Covers rejection of negative price/threshold and non-whole quantities at the contract boundary.

## Out of Scope

Purchase orders, goods receipts, sales, and reports (covered by the two sibling specs). Everything in TOR Section 3: general ledger, AP/AR, payroll, manufacturing, tax, real payments, external POS/ERP integration, inter-store transfers, batch/expiry tracking, returns, real-data migration. Inventory valuation and cost of goods sold. CR-01 damaged-goods receiving. Reversals (corrections go through manager adjustment per the Q-04 decision).

## Further Notes

- All screens in Thai; dates/times in Asia/Bangkok.
- Clarification decisions carried from the design session: single base unit per SKU (Q-05); corrections via manager adjustment, no reversals (Q-04).
- This spec unblocks the purchasing/receiving spec and the sales/reporting spec; both depend on the models, movement mechanism, roles, and store scoping defined here.
