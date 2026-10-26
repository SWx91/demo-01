import { oc } from '@orpc/contract';
import * as z from 'zod';
import { StoreSchema } from './auth.js';

/** Fields an Administrator provides when creating a store. Thai, actionable validation messages. */
export const CreateStoreSchema = z.object({
  code: z.string().trim().min(1, 'กรุณากรอกรหัสสาขา'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสาขา'),
});
export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;

/** Editing a store: the id plus the same fields. */
export const UpdateStoreSchema = CreateStoreSchema.extend({
  id: z.string().min(1),
});
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

/** Shared list conventions: 1-based page, bounded page size, both optional with defaults. */
export const ListStoresInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListStoresInput = z.infer<typeof ListStoresInputSchema>;

/** A page of stores, newest first, with the total so the UI can paginate. */
export const ListStoresResultSchema = z.object({
  items: z.array(StoreSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type ListStoresResult = z.infer<typeof ListStoresResultSchema>;

export const storesContract = {
  list: oc
    .route({ method: 'GET', path: '/stores', summary: 'List stores (newest first)', tags: ['Stores'] })
    .input(ListStoresInputSchema)
    .output(ListStoresResultSchema),
  create: oc
    .route({ method: 'POST', path: '/stores', summary: 'Create a store', tags: ['Stores'] })
    .input(CreateStoreSchema)
    .output(StoreSchema),
  update: oc
    .route({ method: 'PUT', path: '/stores/{id}', summary: 'Edit a store', tags: ['Stores'] })
    .input(UpdateStoreSchema)
    .output(StoreSchema),
};
