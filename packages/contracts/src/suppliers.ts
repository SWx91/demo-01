import { oc } from '@orpc/contract';
import * as z from 'zod';

/** A supplier in the directory: a unique code, a name, and optional contact details. */
export const SupplierSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  contactName: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
});
export type Supplier = z.infer<typeof SupplierSchema>;

/**
 * Fields an Administrator provides when creating a supplier. Code and name are required with Thai,
 * actionable messages; contact details are optional. Empty contact strings normalise to null.
 */
export const CreateSupplierSchema = z.object({
  code: z.string().trim().min(1, 'กรุณากรอกรหัสผู้จัดจำหน่าย'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้จัดจำหน่าย'),
  contactName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.literal(''), z.email('กรุณากรอกอีเมลให้ถูกต้อง')]).optional(),
  address: z.string().trim().optional(),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

/** Editing a supplier: the id plus the same fields. */
export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  id: z.string().min(1),
});
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

/** Shared list conventions: 1-based page, bounded page size, both optional with defaults. */
export const ListSuppliersInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSuppliersInput = z.infer<typeof ListSuppliersInputSchema>;

/** A page of suppliers, newest first, with the total so the UI can paginate. */
export const ListSuppliersResultSchema = z.object({
  items: z.array(SupplierSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type ListSuppliersResult = z.infer<typeof ListSuppliersResultSchema>;

export const suppliersContract = {
  list: oc
    .route({
      method: 'GET',
      path: '/suppliers',
      summary: 'List suppliers (newest first)',
      tags: ['Suppliers'],
    })
    .input(ListSuppliersInputSchema)
    .output(ListSuppliersResultSchema),
  create: oc
    .route({
      method: 'POST',
      path: '/suppliers',
      summary: 'Create a supplier',
      tags: ['Suppliers'],
    })
    .input(CreateSupplierSchema)
    .output(SupplierSchema),
  update: oc
    .route({
      method: 'PUT',
      path: '/suppliers/{id}',
      summary: 'Edit a supplier',
      tags: ['Suppliers'],
    })
    .input(UpdateSupplierSchema)
    .output(SupplierSchema),
};
