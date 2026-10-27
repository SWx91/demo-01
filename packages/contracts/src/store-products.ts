import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * A per-store reorder threshold, in whole units. Non-negative (MD-02) — a negative threshold is
 * refused here at the contract boundary with a Thai, actionable message. Whole units only.
 */
export const ReorderThresholdSchema = z
  .int('จุดสั่งซื้อซ้ำต้องเป็นจำนวนเต็ม')
  .min(0, 'จุดสั่งซื้อซ้ำต้องไม่ติดลบ');
export type ReorderThreshold = z.infer<typeof ReorderThresholdSchema>;

/**
 * A store-scoped product row: it ties a product to a store and carries the per-store reorder
 * threshold (MD-01). One row per (store, product), so a product can hold a different threshold in
 * each store. This is the row later stock balances attach to.
 */
export const StoreProductSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  productId: z.string(),
  reorderThreshold: ReorderThresholdSchema,
});
export type StoreProduct = z.infer<typeof StoreProductSchema>;

/**
 * Setting the reorder threshold for a product in a store: the store, the product, and the
 * non-negative threshold. Idempotent — setting it again overwrites the store-scoped row.
 */
export const SetReorderThresholdSchema = z.object({
  storeId: z.string().min(1, 'กรุณาเลือกสาขา'),
  productId: z.string().min(1, 'กรุณาเลือกสินค้า'),
  reorderThreshold: ReorderThresholdSchema,
});
export type SetReorderThresholdInput = z.infer<typeof SetReorderThresholdSchema>;

export const storeProductsContract = {
  setReorderThreshold: oc
    .route({
      method: 'PUT',
      path: '/store-products/reorder-threshold',
      summary: 'Set the reorder threshold for a product in a store',
      tags: ['Store products'],
    })
    .input(SetReorderThresholdSchema)
    .output(StoreProductSchema),
};
