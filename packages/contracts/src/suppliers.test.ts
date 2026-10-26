import { describe, expect, it } from 'vitest';
import {
  CreateSupplierSchema,
  ListSuppliersInputSchema,
  ListSuppliersResultSchema,
  UpdateSupplierSchema,
} from './suppliers.js';

describe('CreateSupplierSchema', () => {
  it('accepts a code and name without contact details', () => {
    const result = CreateSupplierSchema.safeParse({ code: 'SUP01', name: 'SupplyOne Co Ltd' });

    expect(result.success).toBe(true);
  });

  it('accepts a code, name, and contact details', () => {
    const result = CreateSupplierSchema.safeParse({
      code: 'SUP01',
      name: 'SupplyOne Co Ltd',
      contactName: 'Somchai',
      phone: '02-123-4567',
      email: 'sales@supplyone.co.th',
      address: '123 Sukhumvit Rd, Bangkok',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty code', () => {
    expect(CreateSupplierSchema.safeParse({ code: '', name: 'SupplyOne Co Ltd' }).success).toBe(
      false,
    );
  });

  it('rejects an empty name', () => {
    expect(CreateSupplierSchema.safeParse({ code: 'SUP01', name: '' }).success).toBe(false);
  });

  it('rejects a missing code', () => {
    expect(CreateSupplierSchema.safeParse({ name: 'SupplyOne Co Ltd' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(
      CreateSupplierSchema.safeParse({ code: 'SUP01', name: 'SupplyOne Co Ltd', email: 'nope' })
        .success,
    ).toBe(false);
  });
});

describe('UpdateSupplierSchema', () => {
  it('accepts an id with a code and name', () => {
    const result = UpdateSupplierSchema.safeParse({
      id: 'sup1',
      code: 'SUP01',
      name: 'SupplyOne Co Ltd',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(
      UpdateSupplierSchema.safeParse({ id: 'sup1', code: 'SUP01', name: '' }).success,
    ).toBe(false);
  });
});

describe('ListSuppliersInputSchema', () => {
  it('defaults page and pageSize when omitted', () => {
    const result = ListSuppliersInputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rejects a page below 1', () => {
    expect(ListSuppliersInputSchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects a non-integer page', () => {
    expect(ListSuppliersInputSchema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe('ListSuppliersResultSchema', () => {
  it('round-trips a page of suppliers', () => {
    const result = ListSuppliersResultSchema.safeParse({
      items: [
        {
          id: 'sup1',
          code: 'SUP01',
          name: 'SupplyOne Co Ltd',
          contactName: 'Somchai',
          phone: '02-123-4567',
          email: 'sales@supplyone.co.th',
          address: '123 Sukhumvit Rd, Bangkok',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(result.success).toBe(true);
  });
});
