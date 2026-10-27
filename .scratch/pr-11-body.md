## Summary

Ticket #11: add a per-store reorder threshold to products, carried on a store-scoped row so the same product can hold a different threshold in each store. The threshold cannot be negative. This introduces the store-scoped stock row that stock balances will later attach to (covers MD-01 reorder threshold per store, MD-02 non-negative threshold).

- **Database** (`packages/database/prisma/schema.prisma`): new `StoreProduct` model tying a `Store` to a `Product` and carrying `reorderThreshold: Int`, with `@@unique([storeId, productId])` so there is exactly one row per store/product pair. Back-relations added to `Store` and `Product`. Migration `add_store_product_reorder_threshold` creates the table, the unique index, and the foreign keys.
- **Contract** (`packages/contracts/src/store-products.ts`): `ReorderThresholdSchema` (`z.int().min(0)` — the single source of the MD-02 non-negative, whole-number rule, with Thai messages), consumed by both `StoreProductSchema` and `SetReorderThresholdSchema`. A `storeProducts.setReorderThreshold` route (`PUT /store-products/reorder-threshold`), registered in `index.ts`.
- **API** (`apps/api/src/store-products/`): a one-feature Nest module whose controller implements `contract.storeProducts.setReorderThreshold` with `@Implement`/`implement().handler()`, restricted to `@Roles('ADMINISTRATOR')`. It upserts the store-scoped row keyed on the `(storeId, productId)` compound unique, so setting is idempotent per store and each store keeps its own threshold. Registered in `app.module.ts`.

## What was tested

Seams match the ticket: Zod schema spec and oRPC controller spec.

- **Zod schema spec** (`packages/contracts/src/store-products.test.ts`): a non-negative whole threshold is accepted (including zero); a negative threshold is rejected at the contract boundary (MD-02), both directly on `ReorderThresholdSchema` and through `SetReorderThresholdSchema`; a fractional threshold is rejected (whole units only); a missing store or product is rejected.
- **oRPC controller spec** (`apps/api/src/store-products/store-products.controller.spec.ts`): a threshold is set on the store-scoped row, keyed on store and product, asserting the exact upsert args (AC1); the same product keeps separate thresholds in B01 and B02 (AC3); a negative threshold is rejected before reaching Prisma; the route carries `@Roles('ADMINISTRATOR')` so a non-administrator is refused before any data change.
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Review

A two-axis review (Standards and Spec) ran against `main` and returned **APPROVED** with no blocking findings. Standards: no documented-standard violation — contract-first, `@Implement` with no hand-declared route, no `class-validator` DTO, DB access only via the injected `PrismaService`, ESM `.js` extensions throughout. Spec: all three acceptance criteria met and tested; no scope creep (the `StoreProduct` model is exactly the store-scoped row the ticket names).

Two non-blocking notes, no action taken for this ticket:

- `reorderThreshold Int @default(0)` could let a future writer create a row whose "unset" 0 is indistinguishable from a deliberate 0. Inert here — the set route is the only writer and always supplies a value; revisit when stock balances start creating rows.
- The exported `ReorderThreshold` / `StoreProduct` / `SetReorderThresholdInput` types have no consumer yet, consistent with the other contracts' pattern.

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role, following the products-controller precedent.
- No `list`/`get` route for store products yet — this ticket only sets the threshold; reads arrive with later inventory tickets.

Closes #11
