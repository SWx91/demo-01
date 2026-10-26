## Summary

The first full-stack feature (ticket #6): an Administrator manages stores, and the list conventions every later list reuses — pagination, newest-first, loading/success/error states, and Thai, actionable errors that never leak stack traces. Built contract-first per the `add-feature` recipe.

- **Contract** (`packages/contracts/src/stores.ts`): `CreateStoreSchema` / `UpdateStoreSchema` (code & name `trim().min(1)` with Thai messages), `ListStoresInputSchema` (1-based `page`, bounded `pageSize`, defaults 1/20), `ListStoresResultSchema` (`{ items, total, page, pageSize }`). `storesContract`: `list` (GET), `create` (POST), `update` (PUT `/stores/{id}`). Registered in the `contract` object.
- **API** (`apps/api/src/stores/`): `list` orders `createdAt desc` with skip/take + count; `create`/`update` are `@Roles('ADMINISTRATOR')`, so a non-admin is refused by the global `AuthGuard` before any data change. A duplicate `code` (Prisma `P2002`) becomes a Thai `CONFLICT`.
- **Web** (`apps/web/src/routes/stores.tsx`): list table (newest-first as the API returns), pagination, loading/empty states, a Thai list error, and an admin-only create form with Thai success and error (the server's Thai `CONFLICT` message passes through; anything else falls back to a generic Thai sentence via the typed `ORPCError`, so no detail leaks). Linked from the home page.

## What was tested

- **Zod schema spec** (`packages/contracts/src/stores.test.ts`): empty/missing code and name rejected at the boundary; list input defaults and bounds; result round-trip.
- **oRPC controller spec** (`apps/api/src/stores/stores.controller.spec.ts`): newest-first + pagination metadata, page-2 skip, create, duplicate→`CONFLICT`, edit, and that create/update require `ADMINISTRATOR` while list is unrestricted.
- **Web component test** (`apps/web/src/routes/stores.test.tsx`): loading, newest-first rows, Thai list error without stack trace, Thai create-success confirmation, and the Thai conflict message.
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.

## Notes

- "Administrator" maps to the `ADMINISTRATOR` role from #4 (not legacy `ADMIN`).
- Depends on #5 (`Store` model + assignment). Base is **`ticket/no5`**, not `Dev-SW`, because #5 is not merged yet; retarget to `Dev-SW` once #5 lands.

Closes #6
