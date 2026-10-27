import { describe, expect, it } from 'vitest';
import {
  ReorderThresholdSchema,
  SetReorderThresholdSchema,
  StoreProductSchema,
} from './store-products.js';

describe('ReorderThresholdSchema', () => {
  it('accepts a positive whole number', () => {
    expect(ReorderThresholdSchema.safeParse(3).success).toBe(true);
  });

  it('accepts zero', () => {
    expect(ReorderThresholdSchema.safeParse(0).success).toBe(true);
  });

  it('rejects a negative threshold (MD-02)', () => {
    expect(ReorderThresholdSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects a fractional threshold (whole units only)', () => {
    expect(ReorderThresholdSchema.safeParse(2.5).success).toBe(false);
  });
});

describe('StoreProductSchema', () => {
  const validStoreProduct = {
    id: 'sp1',
    storeId: 'store-b01',
    productId: 'prod1',
    reorderThreshold: 3,
  };

  it('round-trips a store-scoped product row', () => {
    const result = StoreProductSchema.safeParse(validStoreProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validStoreProduct);
    }
  });

  it('rejects a negative threshold', () => {
    expect(
      StoreProductSchema.safeParse({ ...validStoreProduct, reorderThreshold: -1 }).success,
    ).toBe(false);
  });
});

describe('SetReorderThresholdSchema', () => {
  const validInput = {
    storeId: 'store-b01',
    productId: 'prod1',
    reorderThreshold: 3,
  };

  it('accepts a store, product, and non-negative threshold', () => {
    expect(SetReorderThresholdSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejects a negative threshold at the contract boundary (MD-02)', () => {
    expect(
      SetReorderThresholdSchema.safeParse({ ...validInput, reorderThreshold: -1 }).success,
    ).toBe(false);
  });

  it('rejects a missing store', () => {
    const { storeId, ...withoutStore } = validInput;
    void storeId;
    expect(SetReorderThresholdSchema.safeParse(withoutStore).success).toBe(false);
  });

  it('rejects a missing product', () => {
    const { productId, ...withoutProduct } = validInput;
    void productId;
    expect(SetReorderThresholdSchema.safeParse(withoutProduct).success).toBe(false);
  });
});
