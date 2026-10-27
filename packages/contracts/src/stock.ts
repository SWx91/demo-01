import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * Why a stock balance ever changed. Every stock movement carries one. RECEIPT raises a balance
 * (goods received), SALE lowers it, ADJUSTMENT is a manual correction, OPENING is the seeded
 * starting balance. The enum is closed so an unknown reason is refused at the contract boundary.
 */
export const MovementTypeSchema = z.enum(['OPENING', 'RECEIPT', 'SALE', 'ADJUSTMENT']);
export type MovementType = z.infer<typeof MovementTypeSchema>;

/** A whole, non-negative stock quantity. Fractional or negative amounts are refused (MD-02). */
export const StockQuantitySchema = z
  .int('จำนวนคงเหลือต้องเป็นจำนวนเต็ม')
  .min(0, 'จำนวนคงเหลือต้องไม่ติดลบ');

/**
 * An immutable record of one stock change (INV-02, US-13). It names the product and store, the
 * signed quantity change, the balance before and after, why it changed, the source document that
 * drove it, who posted it, and when. Once written it is never edited or deleted — the contract
 * exposes no route to do so.
 */
export const StockMovementSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  productId: z.string(),
  quantityChange: z.int('ส่วนเปลี่ยนแปลงต้องเป็นจำนวนเต็ม'),
  balanceBefore: StockQuantitySchema,
  balanceAfter: StockQuantitySchema,
  movementType: MovementTypeSchema,
  sourceDocument: z.string(),
  actorId: z.string(),
  // The handler returns a Date (Prisma); over the wire it is an ISO string. Accept either and
  // normalise to an ISO string so the same schema validates the handler return and the response.
  createdAt: z
    .union([z.date(), z.iso.datetime()])
    .transform((value) => (value instanceof Date ? value.toISOString() : value)),
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

/**
 * The current stock balance of a product in a store (US-14: opening plus every successful
 * movement). One row per (store, product); the quantity is whole and never negative.
 */
export const StockBalanceSchema = z.object({
  storeId: z.string(),
  productId: z.string(),
  quantity: StockQuantitySchema,
});
export type StockBalance = z.infer<typeof StockBalanceSchema>;

/**
 * Posting a stock movement: the store, the product, the signed quantity change, why, and the
 * source document that drove it. A movement must change the balance, so a zero change is refused;
 * the change is whole (MD-02). The actor and resulting balances are derived server-side, never
 * taken from the request.
 */
export const PostStockMovementSchema = z.object({
  storeId: z.string().min(1, 'กรุณาเลือกสาขา'),
  productId: z.string().min(1, 'กรุณาเลือกสินค้า'),
  quantityChange: z
    .int('ส่วนเปลี่ยนแปลงต้องเป็นจำนวนเต็ม')
    .refine((value) => value !== 0, 'การเคลื่อนไหวสต็อกต้องเปลี่ยนแปลงจำนวนคงเหลือ'),
  movementType: MovementTypeSchema,
  sourceDocument: z.string().min(1, 'กรุณาระบุเอกสารต้นทาง'),
});
export type PostStockMovementInput = z.infer<typeof PostStockMovementSchema>;

/** Reading the stock balances in a store. */
export const ListStockBalancesSchema = z.object({
  storeId: z.string().min(1, 'กรุณาเลือกสาขา'),
});
export type ListStockBalancesInput = z.infer<typeof ListStockBalancesSchema>;

/**
 * A Manager increasing or decreasing stock with a mandatory reason (INV-05). `reason` is the
 * adjustment's source document — a manual correction has no separate paper document, so the
 * reason the manager gives fills that role on the resulting movement. The movement type is fixed
 * to ADJUSTMENT server-side (not part of this input), so a caller cannot post a different kind of
 * movement through this route. A reduction greater than the available balance is rejected by the
 * same posting mechanism every movement goes through.
 */
export const AdjustStockSchema = z.object({
  storeId: z.string().min(1, 'กรุณาเลือกสาขา'),
  productId: z.string().min(1, 'กรุณาเลือกสินค้า'),
  quantityChange: z
    .int('ส่วนเปลี่ยนแปลงต้องเป็นจำนวนเต็ม')
    .refine((value) => value !== 0, 'การปรับสต็อกต้องเปลี่ยนแปลงจำนวนคงเหลือ'),
  reason: z.string().min(1, 'กรุณาระบุเหตุผล'),
});
export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;

export const stockContract = {
  post: oc
    .route({
      method: 'POST',
      path: '/stock/movements',
      summary: 'Post a stock movement (updates the balance and records the movement atomically)',
      tags: ['Stock'],
    })
    .input(PostStockMovementSchema)
    .output(StockMovementSchema),
  listBalances: oc
    .route({
      method: 'GET',
      path: '/stock/balances',
      summary: 'List the stock balances in a store',
      tags: ['Stock'],
    })
    .input(ListStockBalancesSchema)
    .output(z.array(StockBalanceSchema)),
  adjust: oc
    .route({
      method: 'POST',
      path: '/stock/adjustments',
      summary: 'Manager stock adjustment with a mandatory reason (increase or decrease)',
      tags: ['Stock'],
    })
    .input(AdjustStockSchema)
    .output(StockMovementSchema),
};
