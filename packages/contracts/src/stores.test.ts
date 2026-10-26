import { describe, expect, it } from 'vitest';
import {
  CreateStoreSchema,
  ListStoresInputSchema,
  ListStoresResultSchema,
  UpdateStoreSchema,
} from './stores.js';

describe('CreateStoreSchema', () => {
  it('accepts a code and name', () => {
    const result = CreateStoreSchema.safeParse({ code: 'B01', name: 'Central Store' });

    expect(result.success).toBe(true);
  });

  it('rejects an empty code', () => {
    expect(CreateStoreSchema.safeParse({ code: '', name: 'Central Store' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(CreateStoreSchema.safeParse({ code: 'B01', name: '' }).success).toBe(false);
  });

  it('rejects a missing code', () => {
    expect(CreateStoreSchema.safeParse({ name: 'Central Store' }).success).toBe(false);
  });
});

describe('UpdateStoreSchema', () => {
  it('accepts an id with a code and name', () => {
    const result = UpdateStoreSchema.safeParse({ id: 's1', code: 'B01', name: 'Central Store' });

    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(UpdateStoreSchema.safeParse({ id: 's1', code: 'B01', name: '' }).success).toBe(false);
  });
});

describe('ListStoresInputSchema', () => {
  it('defaults page and pageSize when omitted', () => {
    const result = ListStoresInputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rejects a page below 1', () => {
    expect(ListStoresInputSchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects a non-integer page', () => {
    expect(ListStoresInputSchema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe('ListStoresResultSchema', () => {
  it('round-trips a page of stores', () => {
    const result = ListStoresResultSchema.safeParse({
      items: [{ id: 's1', code: 'B01', name: 'Central Store' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(result.success).toBe(true);
  });
});
