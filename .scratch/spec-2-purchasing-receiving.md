## Problem Statement

RetailOne's purchasing and receiving live in separate files, so purchase orders, approvals, and goods receipts are not connected to stock. The same delivery can be received twice, a retry after a network error can double stock, and nobody can see how much of an order is still outstanding. Purchasing officers, managers, and store employees need one controlled flow from draft order to fully received, with stock changing only when goods actually arrive.

## Solution

A purchasing and goods-receiving flow built on the master-data/inventory foundation. Purchasing officers draft and submit orders; managers approve or reject them; store employees receive approved orders for their own store, partially or in full, across multiple deliveries. Stock increases only on confirmed receipt, each receipt writes immutable inventory movements, and the order status tracks Draft → Pending Approval → Approved → Partially Received → Completed (with Rejected and Cancelled branches). Repeated clicks, duplicate requests, and retries never increase stock twice.

## User Stories

1. As a purchasing officer, I want to create a draft purchase order with a supplier, destination store, expected receipt date, and at least one product line, so that I can plan a purchase.
2. As a purchasing officer, I want ordered quantities constrained to positive whole numbers and purchase unit prices rejected when negative, so that an order is always valid.
3. As a purchasing officer, I want duplicate SKUs in one order rejected, so that each product appears once.
4. As a purchasing officer, I want to edit a draft and submit it for approval when complete, so that only finished orders reach a manager.
5. As a purchasing officer, I want to see receiving status for my orders, so that I know what is outstanding.
6. As a purchasing officer, I want to be unable to approve my own orders, so that approval stays a manager responsibility.
7. As a manager, I want to approve or reject a submitted order with a reason, so that purchasing is controlled.
8. As a manager, I want approved lines, quantities, prices, and destination store frozen, so that an approved order cannot be altered.
9. As a manager, I want a rejected order to remain viewable while requiring a brand-new order to resubmit, so that history is preserved.
10. As a creator or manager, I want to cancel only a Draft or Pending Approval order, with a reason, so that approved or partially received orders stay intact.
11. As the business, I want creating or approving an order to never change stock, so that stock reflects only real receipts.
12. As a store employee, I want to receive only Approved or Partially Received orders for my assigned store, so that I handle only my store's deliveries.
13. As a store employee, I want the receiving screen to show ordered, previously received, and outstanding quantities per line, so that I know what to receive.
14. As a store employee, I want to receive partial deliveries across multiple visits, so that real-world deliveries are supported.
15. As a store employee, I want each received quantity constrained to a non-negative whole number with at least one line greater than zero, so that an empty or invalid receipt is rejected.
16. As the business, I want cumulative receipts never to exceed ordered quantities, so that over-receiving is impossible.
17. As a store employee, I want products outside the order rejected on the receiving screen, so that only ordered goods are received.
18. As the business, I want confirmation to create a goods-receipt number, increase destination-store stock, and record inventory movements in one transaction, so that stock and audit stay consistent.
19. As the business, I want the order to become Partially Received when quantity remains outstanding, or Completed when every line is fully received, so that status reflects reality.
20. As a store employee, I want repeated confirmation clicks, duplicate requests, and retries after a network failure to never increase stock twice and to return the original receipt, so that retries are safe.
21. As a store employee, I want a deliberately new receipt to still be possible, so that a second genuine delivery can be recorded.
22. As the business, I want concurrent receiving requests to never exceed the order quantity in total, so that two staff receiving at once cannot over-receive.
23. As a store employee, I want confirmed receipts to stay viewable but not editable or cancellable, so that receipts are a permanent record.
24. As an auditor, I want goods receipts audited with actor, timestamp, source document, and outcome, so that receiving is traceable.
25. As a store employee from another store, I want a direct API request to receive goods for a store that is not mine rejected with no data change, so that permissions are enforced at the API.

## Implementation Decisions

- **New Nest feature modules**: purchasing (purchase orders) and receiving (goods receipts) under `apps/api/src/`, each implementing contract routes.
- **New contracts** `packages/contracts/src/purchasing.ts` and `receiving.ts`, registered in the root `contract`. Zod schemas own all input/output and the status enum.
- **Prisma models**: `PurchaseOrder` (supplier, destination store, expected receipt date, status, creator, reason for approve/reject/cancel), `PurchaseOrderLine` (product, ordered qty, purchase unit price, received-so-far derived or stored), `GoodsReceipt` (number, order, store, actor, idempotency key, createdAt), `GoodsReceiptLine` (product, received qty). Status enum: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PARTIALLY_RECEIVED`, `COMPLETED`, `REJECTED`, `CANCELLED`.
- **Status machine** enforced in the purchasing handler. Allowed transitions only; approve/reject require a manager and a reason; approved orders are immutable; cancellation limited to Draft/Pending Approval. Resubmission is a new order, not a state change on a rejected one.
- **Receipt posting** runs in one DB transaction (building on the inventory spec's movement mechanism): allocate the goods-receipt number, write `GoodsReceiptLine`s, increase `StockBalance` for the destination store, write `RECEIPT` `StockMovement`s with before/after balances, and recompute order status to Partially Received or Completed. All-or-nothing.
- **Idempotency**: the receiving route takes a client-supplied idempotency key with a DB unique constraint. A repeated key returns the original receipt and makes no further change; a new key with the same order is a deliberate new receipt. This is the Q-decision carried from the design session (idempotency key + unique constraint, key reuse = replay, new key = new document).
- **Over-receiving prevention at the DB**: cumulative received quantity per line is validated against ordered quantity inside the transaction with a guarded update, so concurrent receipts cannot jointly exceed the order (INV-04 mechanism reused).
- **Inactive-product-after-approval (Q-02 decision)**: a product deactivated after its order was approved may still be received against that approved order until the order closes; the Manager authorizes this as a recorded exception. The receiving handler allows receipt of lines on an approved order even if the product is now inactive.
- **Permission at the API** (NFR-01): receiving is restricted to a store employee whose assigned store equals the order's destination store, derived from identity; approval/rejection restricted to Manager. Purchasing officers cannot approve.
- **Web**: pages for drafting/submitting orders (purchasing officer), approving/rejecting (manager), and a receiving screen (store employee) showing ordered/received/outstanding per line, via the typed `orpc` client, with loading/success/error states and Thai error messages.

## Testing Decisions

A good test asserts outcomes — resulting status, persisted stock, the returned receipt, the rejection — not internals. Same three seams, confirmed with the developer:

1. **oRPC controller specs with a stubbed `PrismaService`** (prior art: `apps/api/src/health/health.controller.spec.ts`): status-machine transitions and their guards, line validation (positive whole numbers, no duplicate SKU, no non-ordered product), outstanding-quantity display logic, partial-then-complete flow (the AC-01 shape: receive 8 of 20 → stock 18, outstanding 12, Partially Received, exactly one receipt + one movement), over-receive rejection (AC-03: receiving 21 rejected, no receipt/movement, status unchanged), and cross-store API rejection (AC-04).
2. **Integration specs against a real Postgres (Docker)** — for the proofs a stub cannot give: idempotent replay (AC-02: receive 8, resend same key → original receipt, stock stays 18, cumulative stays 8) and concurrent receiving not exceeding the order total (the INV-04/GR-05 mechanism).
3. **Zod schema specs in `packages/contracts`** (prior art: `packages/contracts/src/auth.test.ts`): rejection of negative prices, non-positive or non-whole ordered quantities, duplicate SKUs in one order.

## Out of Scope

Master data, stock model, and the movement mechanism (defined in the master-data/inventory spec, a prerequisite). Sales and reporting (sibling spec). Cancellation of Approved or partially received orders. Receipt reversal or editing (Q-04: corrections go through manager adjustment). Backdated receiving (Q-03: system confirmation timestamp only). Multi-approver / approval thresholds / delegation (Q-01: single-manager approval). CR-01 damaged-goods receiving. Everything in TOR Section 3.

## Further Notes

- Business example from the TOR: order of 20 units, store holds 10; receiving 8 → 18 (12 outstanding, Partially Received); receiving the remaining 12 → 30 (Completed).
- Depends on the master-data/inventory spec for `Product`, `Store`, `Supplier`, `StockBalance`, `StockMovement`, roles, and store scoping.
- Blocks nothing; the sales/reporting spec is independent of this one but shares the inventory foundation.
