import { ORPCError } from '@orpc/nest';
import { describe, expect, it } from 'vitest';
import { assertProductActive } from './product-active.guard.js';

describe('assertProductActive', () => {
  it('passes an active product through unchanged', () => {
    const product = { sku: 'SKU003', name: 'Laundry detergent', active: true };

    expect(() => assertProductActive(product)).not.toThrow();
  });

  it('rejects an inactive product with a Thai actionable BAD_REQUEST', () => {
    const product = { sku: 'SKU003', name: 'Laundry detergent', active: false };

    try {
      assertProductActive(product);
      expect.unreachable('expected assertProductActive to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      const orpcError = error as ORPCError<string, unknown>;
      expect(orpcError.code).toBe('BAD_REQUEST');
      // Names the offending product and tells the user what to do about it.
      expect(orpcError.message).toContain('SKU003');
      expect(orpcError.message).toContain('ปิดใช้งาน');
    }
  });
});
