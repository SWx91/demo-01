import { describe, expect, it } from 'vitest';
import { CreateProductSchema, ProductSchema, QuantitySchema } from './products.js';

const validProduct = {
  id: 'prod1',
  sku: 'SKU-001',
  name: 'Jasmine Rice 5kg',
  category: 'Groceries',
  unit: 'bag',
  sellingPriceMinor: 12500,
  active: true,
};

describe('ProductSchema', () => {
  it('round-trips a product with all fields', () => {
    const result = ProductSchema.safeParse(validProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validProduct);
    }
  });

  it('carries SKU, name, category, unit, selling price, and active status', () => {
    const result = ProductSchema.safeParse(validProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe('SKU-001');
      expect(result.data.name).toBe('Jasmine Rice 5kg');
      expect(result.data.category).toBe('Groceries');
      expect(result.data.unit).toBe('bag');
      expect(result.data.sellingPriceMinor).toBe(12500);
      expect(result.data.active).toBe(true);
    }
  });

  it('rejects a negative selling price', () => {
    expect(ProductSchema.safeParse({ ...validProduct, sellingPriceMinor: -1 }).success).toBe(false);
  });

  it('rejects a fractional selling price (minor units are whole)', () => {
    expect(ProductSchema.safeParse({ ...validProduct, sellingPriceMinor: 125.5 }).success).toBe(
      false,
    );
  });
});

describe('CreateProductSchema', () => {
  it('accepts a product without an id', () => {
    const { id, ...withoutId } = validProduct;
    void id;
    expect(CreateProductSchema.safeParse(withoutId).success).toBe(true);
  });

  it('defaults active to true when omitted', () => {
    const { id, active, ...rest } = validProduct;
    void id;
    void active;
    const result = CreateProductSchema.safeParse(rest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
    }
  });

  it('rejects an empty sku', () => {
    const { id, ...rest } = validProduct;
    void id;
    expect(CreateProductSchema.safeParse({ ...rest, sku: '' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    const { id, ...rest } = validProduct;
    void id;
    expect(CreateProductSchema.safeParse({ ...rest, name: '' }).success).toBe(false);
  });

  it('rejects a negative selling price', () => {
    const { id, ...rest } = validProduct;
    void id;
    expect(CreateProductSchema.safeParse({ ...rest, sellingPriceMinor: -5 }).success).toBe(false);
  });
});

describe('QuantitySchema', () => {
  it('accepts a whole number', () => {
    expect(QuantitySchema.safeParse(10).success).toBe(true);
  });

  it('accepts zero', () => {
    expect(QuantitySchema.safeParse(0).success).toBe(true);
  });

  it('rejects a non-whole quantity', () => {
    expect(QuantitySchema.safeParse(1.5).success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(QuantitySchema.safeParse(-1).success).toBe(false);
  });
});
