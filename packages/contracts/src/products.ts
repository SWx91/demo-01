import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * A quantity of stock. Quantities are whole units — fractional amounts are refused at the
 * contract boundary. Reused by later inventory tickets (reorder thresholds, stock levels).
 */
export const QuantitySchema = z.int('กรุณากรอกจำนวนเป็นจำนวนเต็ม').min(0, 'จำนวนต้องไม่ติดลบ');
export type Quantity = z.infer<typeof QuantitySchema>;

/**
 * The selling price in integer minor units (e.g. satang: 12500 = ฿125.00). Storing money as whole
 * minor units avoids floating-point drift and preserves exactly two decimal places across a
 * contract call — the value is an integer end to end, formatted to two decimals only for display.
 */
export const SellingPriceMinorSchema = z
  .int('ราคาต้องเป็นจำนวนเต็มของหน่วยย่อย (สตางค์)')
  .min(0, 'ราคาขายต้องไม่ติดลบ');

/** A product in the catalogue: SKU, name, category, unit, selling price, and active status. */
export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  sellingPriceMinor: SellingPriceMinorSchema,
  active: z.boolean(),
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Fields provided when creating a product. SKU, name, category, and unit are required with Thai,
 * actionable messages; active defaults to true.
 */
export const CreateProductSchema = z.object({
  sku: z.string().trim().min(1, 'กรุณากรอกรหัสสินค้า (SKU)'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสินค้า'),
  category: z.string().trim().min(1, 'กรุณากรอกหมวดหมู่สินค้า'),
  unit: z.string().trim().min(1, 'กรุณากรอกหน่วยนับ'),
  sellingPriceMinor: SellingPriceMinorSchema,
  active: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

/** Editing a product: the id plus the same fields. */
export const UpdateProductSchema = CreateProductSchema.extend({
  id: z.string().min(1),
});
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const productsContract = {
  create: oc
    .route({
      method: 'POST',
      path: '/products',
      summary: 'Create a product',
      tags: ['Products'],
    })
    .input(CreateProductSchema)
    .output(ProductSchema),
};
