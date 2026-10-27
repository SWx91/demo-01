## Summary

Ticket #18: freeze a product's SKU once any stock movement references it. Before that, the SKU can still be corrected; past that point, changing it is rejected with a Thai, actionable error while every other field stays editable (MD-01, US-03).

- **Database** (`packages/database/src/products.ts`): new `isSkuEditable(prisma, productId, currentSku, nextSku)`. Resubmitting the same SKU is always allowed, movement or not — the movement count is only queried when the caller is actually trying to change the value, so editing an unrelated field after the freeze never trips a check.
- **Contract** (`packages/contracts/src/products.ts`): `UpdateProductSchema` carries `sku` again. It had been removed entirely by an earlier ticket pending this one ("handled by a later immutability ticket"); AC1 needs it back so a pre-movement product can still have its SKU corrected through the same route.
- **API** (`apps/api/src/products/products.controller.ts`): `update()` now looks up the product's current SKU, calls `isSkuEditable`, and rejects a frozen change with a Thai `CONFLICT` naming the stored SKU. Since the SKU is writable again, a changed value also goes through the existing `withDuplicateSkuGuard` (NFR-04: no raw Prisma unique-constraint error should ever reach the client).
- **Web** (`apps/web/src/routes/products.tsx`): the edit form's SKU field is enabled again and sent on save. Its field and button labels are renamed from the create form's identical ones (e.g. `แก้ไขชื่อสินค้า` vs `ชื่อสินค้า`, `บันทึกการแก้ไข` vs `บันทึก`) — both forms render together once a product has just been created, and an identical accessible name on two visible controls is ambiguous for a screen reader and for a Playwright locator alike (`apps/web/AGENTS.md`'s accessible-names rule). The web unit tests previously papered over this with React Testing Library's `selector` escape hatch; a real browser locator has no equivalent, so the page needed the fix, not the test.

## What was tested

Seams match the ticket, plus the Demo line:

- **oRPC controller spec** (`apps/api/src/products/products.controller.spec.ts`): a product with no movement can have its SKU corrected (AC1); once a movement exists, changing the SKU is rejected with a Thai `CONFLICT` naming the stored SKU (AC2); other fields stay editable when the SKU is resubmitted unchanged, and the movement count is never even queried in that case (AC3); a changed SKU that collides with another product's still surfaces the existing duplicate-SKU Thai conflict, not a raw Prisma error.
- **Postgres integration spec** (`packages/database/src/products.integration.spec.ts`): `isSkuEditable` against a real Postgres — true with zero referencing movements (AC1), false once a movement exists (AC2), and true when the SKU itself is unchanged regardless of movement history (AC3).
- **Playwright e2e** (`apps/e2e/tests/sku-immutability.e2e.ts`), the Demo line: creates its own product through the products screen (unique SKU, per `write-e2e`'s isolation rule rather than the seeded SKU001 the Demo line names), posts a stock movement against it through the API, then shows editing the SKU is rejected with the Thai error and editing the name still saves. Needed a third seeded e2e identity (`administrator`, added to `apps/e2e/tests/accounts.ts`) since the products screen is restricted to the `ADMINISTRATOR` role, distinct from the two accounts already saved there.
- `pnpm check` (lint, typecheck, test, build — 19 tasks) and `pnpm format` pass from the repo root. `pnpm e2e` passes locally (8/8, Chromium already installed on this machine).

## Review

Sub-agent dispatch wasn't available in this unattended run (the approval prompt had no one to answer it, same as ticket #17's run), so the two-axis review was done directly instead, covering Standards and Spec.

- **Standards**: no blocking violation. Contract-first flow preserved (the contract, not the controller, is still the typed source of truth); ESM relative imports with `.js` in `@erp/database`; database access stays through the injected `PrismaService`/the Prisma client passed into `isSkuEditable`; no hand-written `fetch` in the web change. The label/button renames are a direct application of `apps/web/AGENTS.md`'s accessible-names rule, not scope creep. The `withDuplicateSkuGuard` reuse on `update()` is necessitated by NFR-04 now that the SKU is writable again, not speculative.
- **Spec**: all three acceptance criteria met and tested at the named seams (oRPC controller spec, Postgres integration spec), plus the mandatory e2e for the Demo line. No scope creep beyond what AC1 and the Demo line require of the real UI and its test fixtures.

## Notes

- `US-03` in the ticket's `Covers:` line has no corresponding entry anywhere in this repo (the TOR only defines `MD-*`/`INV-*`/etc. IDs; other tickets' `US-*` references are similarly undefined here). It wasn't a blocker: the ticket's "What to build" and acceptance criteria are self-contained and fully actionable without it.
- The freeze check adds one extra `product.findUniqueOrThrow` per edit (to read the current SKU for comparison); the movement-count query itself is skipped whenever the SKU is unchanged. Not expected to matter — `update` isn't one of the endpoints NFR-05's p95 target names.

Closes #18
