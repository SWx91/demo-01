## Summary

Give each user an optional assigned store and derive store scope from the signed-in identity, never from request input (ticket #5).

- `packages/contracts/src/auth.ts` — new `StoreSchema` (`{ id, code, name }`); `UserSchema` gains `store: StoreSchema.nullable().default(null)`. Types stay `z.infer`-derived.
- `packages/database/prisma/schema.prisma` + migration `20261026090838_add_store_and_user_assignment` — new `Store` model (`code` unique), `User.storeId` optional + `store` relation (FK `ON DELETE SET NULL`).
- `apps/api/src/auth/auth.guard.ts` — `USER_SELECT` now selects the assigned store, so the signed-in user carries it. Store scope comes from the session identity (`findUnique` on the session `userId`), never from request input.
- `packages/database/prisma/seed.ts` — seeds stores `B01`/`B02` and the TOR users: `administrator` (ADMINISTRATOR), `buyer01` (PURCHASING_OFFICER), `staff_b01`/`staff_b02` (STORE_EMPLOYEE bound to B01/B02), `manager01` (MANAGER). Legacy `admin`/`staff` kept so existing demo logins still work.

## What was tested

- **Zod schema spec** (`packages/contracts/src/auth.test.ts`): `StoreSchema` accepts/rejects; `UserSchema` round-trips a user with and without an assigned store; `SessionSchema` round-trips the assigned store.
- **oRPC controller spec** (`apps/api/src/auth/auth.controller.spec.ts`): `/auth/me` returns the assigned store for a store employee from identity alone, covering both `B01` and `B02`.
- `pnpm check` (lint, typecheck, test, build — 17 tasks) and `pnpm format` pass from the repo root.
- Seed run against the dev DB verified: `staff_b01 → B01`, `staff_b02 → B02`, other roles unassigned.

## Notes

- `store` is nullable with a `null` default — unassigned users (purchasing, manager, admins) carry `store: null`; only store employees are bound to a branch, as the TOR intends.
- Depends on #4 (the four TOR roles), already present on `Dev-SW`.
- Base is `Dev-SW` (this repo has no `main` branch on the remote).

Closes #5
