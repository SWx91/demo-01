## Summary

Ticket #17: let a Manager increase or decrease stock with a mandatory reason, through the existing one-transaction posting mechanism. A reduction greater than the available balance is rejected. The adjustment is audited with actor, timestamp, source document, and outcome — this ticket establishes the audit-record convention NFR-03 names, for the sibling specs (PO approvals, goods receipts, sales) to reuse.

- **Contract** (`packages/contracts/src/stock.ts`): `AdjustStockSchema` (storeId, productId, a nonzero `quantityChange`, and a mandatory `reason`), a `stock.adjust` route (`POST /stock/adjustments`). The reason is the adjustment's source document — a manual correction has no separate paper document — and the movement type is fixed to `ADJUSTMENT` server-side, not taken from the request.
- **Database** (`packages/database/`): a new `AuditLog` model (`actorId`, `action`, `sourceDocument`, `outcome`, `createdAt`) and a `recordAudit()` helper, migration `add_audit_log`. `action` and `outcome` are free text on purpose, so sibling tickets name their own vocabulary (e.g. `APPROVED`/`REJECTED` for PO approvals) without agreeing on a shared enum up front. `recordAudit()` is a standalone insert, independent of whatever transaction the audited action ran in, so a rejected adjustment (whose posting transaction rolls back) still leaves an audit entry.
- **API** (`apps/api/src/stock/stock.controller.ts`): `adjust()` implements `contract.stock.adjust`, restricted to `@Roles('MANAGER')`. It posts through the existing `postStockMovement` with `movementType: 'ADJUSTMENT'` and `sourceDocument: reason`, then calls `recordAudit()` with outcome `SUCCESS`; on rejection (e.g. the balance would go negative) it still calls `recordAudit()`, with outcome `REJECTED`, before re-throwing the mapped `CONFLICT`.

## What was tested

Seams match the ticket, plus the Demo line:

- **oRPC controller spec** (`apps/api/src/stock/stock.controller.spec.ts`): a manager adjustment posts an `ADJUSTMENT` movement with the reason as the source document and records a `SUCCESS` audit entry (AC1, AC4); an over-reduction is mapped to `CONFLICT` and still records a `REJECTED` audit entry (AC2, AC4); an empty reason is rejected before reaching the posting mechanism; the route carries `@Roles('MANAGER')` so a store employee or administrator is refused by the guard (AC3).
- **Postgres integration spec** (`packages/database/src/stock.integration.spec.ts`): against a real Postgres, an `ADJUSTMENT` posting and a `recordAudit()` call both persist with the expected fields; a reduction greater than the available balance rolls the whole posting back (no movement, balance unchanged — AC2), and the rejection is still independently audited with `outcome: 'REJECTED'` (AC4), proving the audit entry survives the posting's own rollback.
- **Playwright e2e** (`apps/e2e/tests/stock-adjustment.e2e.ts`), the Demo line: `manager01` increases a product by 5 with a reason (balance 5 → 10), and a reduction of 11 against a balance of 10 is rejected with 409 and leaves the balance unchanged. A second test confirms a non-manager (the administrator who set up the fixtures) gets 403 calling the route directly. The test creates its own store/product with unique suffixes rather than the seeded B01/SKU002 rows, per `write-e2e`'s isolation rule, so it never races with another run's mutation of that shared balance.
- `pnpm check` (lint, typecheck, test, build — 19 tasks) and `pnpm format` pass from the repo root. `pnpm e2e` passes locally (6/6, Chromium already installed on this machine).

## Review

A two-axis review (Standards and Spec) ran against `main`. Sub-agent dispatch wasn't available in this unattended run (the approval prompt had no one to answer it), so the review was done directly instead of delegated, covering the same two axes.

- **Standards**: no blocking violation. Contract-first flow, ESM `.js` relative imports, Prisma-only DB access via the injected `PrismaService`, `@Roles`/`@CurrentUser` usage, and test conventions (`call()`, spying on `@erp/database` exports, Reflector-based role assertions) all match existing precedent (`stock.controller.ts`, `store-products.controller.spec.ts`). Two non-blocking notes, no action taken: the `adjust` handler's try/catch shape duplicates `post`'s (two occurrences, consistent with the file's existing style); the e2e file repeats store/product fixture setup across its two tests (matching the one existing e2e file's style, which also has no shared fixture helper yet).
- **Spec**: all four acceptance criteria met and tested at the named seams; no scope creep — the new `AuditLog`/`recordAudit()` infrastructure is exactly what the ticket's body asks for ("this ticket establishes the audit-record convention the sibling specs reuse"), not an addition beyond it.

## Notes

- Role restriction is `MANAGER` only, not `MANAGER` + `ADMINISTRATOR`. The TOR's role table says explicitly that "Administrator ... Transaction approval rights are not granted automatically," and INV-05 names only Managers for stock adjustment, so Administrator was deliberately not added — matching the precedent in `store-products.controller.ts`, which also restricts a route to exactly one named role rather than implying a hierarchy.
- `AuditLog.action` and `AuditLog.outcome` are plain strings rather than enums, so sibling tickets (PO approvals, goods receipts, sales) can name their own outcome vocabulary without a shared enum agreed up front.
- No web UI: this ticket has no `Demo:` line pointing at a page, matching the sibling precedent (ticket #13's stock posting is also API-only so far).

Closes #17
