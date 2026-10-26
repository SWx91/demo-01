## Summary

Ticket #8: define the product model and its contract — SKU, name, category, unit, selling price, and active status — with the contract's Zod schemas as the source of truth that rejects invalid master data. Built contract-first per the `add-feature` recipe.

**Money representation:** selling price is stored as **integer minor units** (satang): `sellingPriceMinor: z.int().min(0)`, e.g. `12500 = ฿125.00`. Keeping money as whole integers end to end avoids floating-point drift and preserves exactly two decimal places across a contract call — the value is only formatted to two decimals for display. (The ticket allowed integer minor units or `Decimal`; integers serialize cleanly through JSON/oRPC, unlike `Decimal`.)

- **Contract** (`packages/contracts/src/products.ts`): `ProductSchema` (id, sku, name, category, unit, `sellingPriceMinor`, `active`), `CreateProductSchema` (sku/name/category/unit `trim().min(1)` with Thai messages; `active` defaults to true), `SellingPriceMinorSchema` (`int().min(0)`), and a reusable `QuantitySchema` (`int().min(0)`) that establishes the MD-02 whole-number-quantity rule for later inventory tickets. `productsContract.create` (POST `/products`). Registered in the `contract` object.
- **Data model** (`packages/database`): `Product` model (`sku @unique`, `sellingPriceMinor Int`, `active` default true) + migration `add_products`.
- **API** (`apps/api/src/products/`): `create` is `@Roles('ADMINISTRATOR')`, selects exactly the contract's fields (`PRODUCT_SELECT`), and translates a duplicate SKU (Prisma `P2002`) into a Thai `CONFLICT` — mirroring the stores/suppliers write path.

## What was tested

- **Zod schema spec** (`packages/contracts/src/products.test.ts`): full-field round-trip through `ProductSchema`; negative selling price rejected; fractional selling price rejected; empty sku/name rejected; `active` defaults to true; `QuantitySchema` accepts whole numbers and zero, rejects fractional and negative.
- **oRPC controller spec** (`apps/api/src/products/products.controller.spec.ts`): create passes the input through with `PRODUCT_SELECT`; the integer price survives a contract call and formats to exactly `123.45`; negative and fractional prices are rejected before reaching Prisma; a duplicate SKU becomes a Thai `CONFLICT`.
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Review

A semantic review against the pre-#8 point confirmed all four acceptance criteria are met at the stated seams. Three standards items were addressed in the final commit: the controller now uses an explicit `PRODUCT_SELECT` like its siblings, a duplicate-SKU `P2002` is translated to a Thai `CONFLICT`, and the unused `UpdateProductSchema` (no edit AC this ticket) was dropped. `QuantitySchema` ships without a consumer by design — it is the MD-02 "whole-number quantities" deliverable the acceptance criteria name directly; the per-store reorder threshold that consumes it is deferred to a later ticket.

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role (not legacy `ADMIN`).
- Depends on #6 (list conventions, already on `Dev-SW`). Base is `Dev-SW`.

Closes #8
