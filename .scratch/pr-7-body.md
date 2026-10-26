## Summary

Ticket #7: an Administrator maintains a supplier directory — code, name, and contact details — reusing the list conventions established for stores (#6): pagination, newest-first, loading/success/error states, and Thai, actionable errors that never leak stack traces. Each supplier is identified by a unique code. Built contract-first per the `add-feature` recipe.

- **Data model** (`packages/database`): `Supplier` model (unique `code`, `name`, nullable `contactName`/`phone`/`email`/`address`), migration `add_suppliers`, and a re-runnable `SUP01 SupplyOne Co Ltd` seed with contact details.
- **Contract** (`packages/contracts/src/suppliers.ts`): `CreateSupplierSchema` / `UpdateSupplierSchema` (code & name `trim().min(1)` with Thai messages; contact fields optional and trimmed; email empty-or-valid), `ListSuppliersInputSchema` (1-based `page`, bounded `pageSize`, defaults 1/20), `ListSuppliersResultSchema` (`{ items, total, page, pageSize }`). `suppliersContract`: `list` (GET), `create` (POST), `update` (PUT `/suppliers/{id}`). Registered in the `contract` object.
- **API** (`apps/api/src/suppliers/`): `list` orders `createdAt desc` with skip/take + count; `create`/`update` are `@Roles('ADMINISTRATOR')`, so a non-admin is refused by the global `AuthGuard` before any data change. Blank contact fields normalise to `null` consistently. A duplicate `code` (Prisma `P2002`) becomes a Thai `CONFLICT`.
- **Web** (`apps/web/src/routes/suppliers.tsx`): list table (newest-first as the API returns), pagination, loading/empty states, a Thai list error, and an admin-only form that both **creates and edits** — a per-row "แก้ไข" button pre-fills the form and calls `update`. The server's Thai `CONFLICT` message passes through; anything else falls back to a generic Thai sentence via the typed `ORPCError`, so no detail leaks.

## What was tested

- **Zod schema spec** (`packages/contracts/src/suppliers.test.ts`): empty/missing code and name rejected at the boundary; optional contact details accepted; malformed email rejected; list input defaults and bounds; result round-trip.
- **oRPC controller spec** (`apps/api/src/suppliers/suppliers.controller.spec.ts`): newest-first + pagination metadata, page-2 skip, create with contact details, blank contact fields normalised to null (trimming the rest), duplicate→`CONFLICT`, edit, and that create/update require `ADMINISTRATOR` while list is unrestricted.
- **Web component test** (`apps/web/src/routes/suppliers.test.tsx`): loading, newest-first rows, Thai list error without stack trace, Thai create-success confirmation, the Thai conflict message, and the edit path (pre-fill + `PUT /suppliers/{id}`).
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Review

A semantic review against the pre-#7 point flagged two substantive items, both fixed in the final commit: the edit acceptance criterion had no UI (added the per-row edit affordance), and blank contact strings were stored as `''` rather than `null` (normalised all four fields consistently). Two duplicated-code judgement calls remain (`withDuplicateCodeGuard` and the `Pagination` component, each shared in shape with the stores feature); left as-is to avoid editing the stores files from another PR and to keep this diff scoped to #7.

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role (not legacy `ADMIN`).
- Depends on #6 (stores list conventions). Base is **`ticket/no6`**, not `Dev-SW`, because #6 is not merged yet; retarget to `Dev-SW` once #6 lands.

Closes #7
