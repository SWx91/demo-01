## Summary

Ticket #10: let an Administrator edit an existing product's mutable fields — name, category, unit, selling price, and active status — with an edit screen. The SKU is deliberately left out; it is immutable here and handled by a later immutability ticket. Builds on #8/#9, which landed the product contract, the `Product` model, and the admin-gated `create` route and screen.

- **Contract** (`packages/contracts/src/products.ts`): adds `UpdateProductSchema` (`id` + the mutable fields, no `sku`) and a `products.update` route (`PUT /products/{id}`), typed via `z.infer`. Reuses `SellingPriceMinorSchema`, so a negative or fractional price is rejected at the contract boundary with the same Thai messages as create.
- **API** (`apps/api/src/products/products.controller.ts`): implements `contract.products.update` with `@Implement`/`implement().handler()`, restricted to `@Roles('ADMINISTRATOR')`, updating by `id` through the injected `PrismaService` and selecting only the contract's fields.
- **Web** (`apps/web/src/routes/products.tsx`): adds `ProductEditForm`, prefilled from the product's current values with a read-only SKU, reusing the baht↔satang conversion and the generic Thai error fallback via the typed `ORPCError`. It renders on `ProductsPage` for the product an admin has just created, so the create → edit flow is reachable end to end (there is no `list`/`get` route yet — that arrives with a later ticket).

## What was tested

- **oRPC controller spec** (`apps/api/src/products/products.controller.spec.ts`): edit updates the mutable fields by `id` and persists (AC1); a negative selling price is rejected before reaching Prisma (AC2); the `update` route carries `@Roles('ADMINISTRATOR')` so a non-administrator is refused before any data change (AC3).
- **Web component test** (`apps/web/src/routes/products.test.tsx`): the edit form is prefilled, saves the mutated fields as integer minor units (satang), and confirms success in Thai; a pending **loading** state (`กำลังบันทึก…`, button disabled); a generic Thai error fallback with no stack-trace leak (AC4). A page test asserts the edit screen is **reachable** after a successful create.
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Review

A two-axis review against the pre-#10 point ran Standards and Spec in parallel. Standards: conforms, no documented-standard violations; it flagged the create/edit form duplication as a judgement call, left as-is because the two forms differ (read-only SKU, active checkbox, create-reveals-edit) and are likely to diverge further. Spec: initially **NEEDS_CHANGES** because `ProductEditForm` was only exercised by tests and never mounted — fixed in the final commit by rendering it for the just-created product, with a page test pinning reachability. The negative-price Thai message was confirmed (`ราคาขายต้องไม่ติดลบ`, inherited from `SellingPriceMinorSchema`).

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role.
- SKU is read-only on the edit screen and absent from `UpdateProductSchema` (immutable this ticket).
- No `list`/`get`-by-id route exists yet, so the edit screen is reached via the just-created product rather than from a product list; a list arrives in a later ticket.
- Base is `Dev-SW` (the repo's default branch), matching prior ticket PRs.

Closes #10
