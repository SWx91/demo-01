## Summary

Expand step of an expand–contract for the role vocabulary (ticket #4). The `Role` enum grows from `ADMIN | STAFF` to add the four TOR roles — `ADMINISTRATOR`, `PURCHASING_OFFICER`, `STORE_EMPLOYEE`, `MANAGER` — added **beside** the existing values so nothing that already compiles breaks.

- `packages/contracts/src/auth.ts` — `RoleSchema` (`z.enum`) extended; `Role`/`User`/`Session` types still derived via `z.infer`.
- `packages/database/prisma/schema.prisma` — `Role` enum extended; migration `20261026085938_expand_role_enum` adds the four values (`ALTER TYPE ... ADD VALUE`, no drops/renames).
- Tests derive their cases from `RoleSchema.options` so they can't drift from the schema.

## What was tested

- **Zod schema spec** (`packages/contracts/src/auth.test.ts`): `RoleSchema` accepts all six values and rejects an unknown role; `SessionSchema` round-trips a user carrying each new role.
- **oRPC controller spec** (`apps/api/src/auth/auth.controller.spec.ts`): `/auth/me` returns a user carrying each of the four new roles; existing auth tests unchanged and still pass.
- `pnpm check` (lint, typecheck, test, build) and `pnpm format` pass from the repo root. Migration applied against the dev database.

## Notes

- Verified no production route is affected: the only `@Roles(...)` usage is a test fixture (`@Roles('ADMIN')`), still valid.
- Retiring the legacy `ADMIN`/`STAFF` values (vs. `ADMINISTRATOR`/`STORE_EMPLOYEE`) is the **contract** step and intentionally out of scope here.

Closes #4
