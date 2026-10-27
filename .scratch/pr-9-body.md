## Summary

Ticket #9: let an Administrator create products with an organization-wide unique SKU (enforced by a database constraint), and give them a management screen to do it. Builds on #8, which already landed the product contract, the `Product` model with `sku @unique`, and the `create` controller (admin-gated, with a Prisma `P2002` → Thai `CONFLICT` guard).

- **API** (`apps/api/src/products/products.controller.spec.ts`): adds a spec asserting the `create` route carries `@Roles('ADMINISTRATOR')` via `ROLES_KEY` metadata, so a non-administrator is refused by the global `AuthGuard` before any data change (AC3). Create + persist (AC1) and duplicate-SKU → Thai `CONFLICT` (AC2) are covered by #8's specs.
- **Web** (`apps/web/src/routes/products.tsx`): an admin-only create screen mirroring the stores/suppliers form idiom — typed `orpc` client only, Thai loading/success/error states. The selling price is entered in baht and converted to integer minor units (satang) before the call (`Math.round(baht * 100)`, e.g. `125.00` → `12500`). The server's Thai `CONFLICT` passes through; anything else falls back to a generic Thai sentence via the typed `ORPCError`, so no stack trace leaks. Registered as `/products` under `RequireAuth` in `router.tsx`.

The price field is validated in the form before the call: a blank or non-numeric value shows a Thai message (`กรุณากรอกราคาขายให้ถูกต้อง`) and never reaches the API, so an empty field can't silently submit a ฿0.00 product.

## What was tested

- **oRPC controller spec** (`apps/api/src/products/products.controller.spec.ts`): create requires `ADMINISTRATOR` (new, AC3). Plus #8's coverage: create passes input through to Prisma (AC1), duplicate SKU → Thai `CONFLICT` (AC2), integer-minor-unit price round-trip, negative/fractional price rejection.
- **Web component test** (`apps/web/src/routes/products.test.tsx`): create success (Thai `role="status"`), selling price sent as integer minor units (`125.00` → `12500`), a pending **loading** state (`กำลังบันทึก…`, button disabled), the Thai SKU-conflict message, a generic fallback that does not leak a stack trace, and blank/non-numeric price rejected in Thai without calling the API (AC4).
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Review

A semantic review against the pre-#9 point returned **APPROVED**. Its two substantive findings — the empty-price edge silently submitting ฿0.00, and the non-numeric edge reaching the API as `NaN` — were addressed in the final commit by validating the price in the form and pinning both edges with tests. AC3 is asserted as route metadata (the guard itself is #8's and tested there), matching the stores/suppliers pattern. `createErrorMessage` is duplicated in shape across stores/suppliers/products; left as-is to avoid touching sibling features and to keep this diff scoped to #9.

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role (not legacy `ADMIN`).
- No `list` route exists yet (contract #8 has only `create`), so this is a create-only screen; a product list arrives in a later ticket.
- Depends on #8 (already on `Dev-SW`). Base is `Dev-SW`.

Closes #9
