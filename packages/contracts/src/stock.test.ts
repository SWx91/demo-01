import { describe, expect, it } from 'vitest';
import {
  MovementTypeSchema,
  PostStockMovementSchema,
  StockBalanceSchema,
  StockMovementSchema,
} from './stock.js';

describe('StockMovementSchema', () => {
  it('accepts a movement that records product, store, change, before/after, type, source, actor and time', () => {
    const result = StockMovementSchema.safeParse({
      id: 'mv1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-DEMO-001',
      actorId: 'user1',
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it('accepts a Date createdAt from the handler and normalises it to an ISO string', () => {
    const result = StockMovementSchema.safeParse({
      id: 'mv1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-DEMO-001',
      actorId: 'user1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.data?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a fractional quantity change', () => {
    const result = StockMovementSchema.safeParse({
      id: 'mv1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 1.5,
      balanceBefore: 10,
      balanceAfter: 11,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-DEMO-001',
      actorId: 'user1',
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative resulting balance', () => {
    const result = StockMovementSchema.safeParse({
      id: 'mv1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: -20,
      balanceBefore: 10,
      balanceAfter: -10,
      movementType: 'SALE',
      sourceDocument: 'SO-1',
      actorId: 'user1',
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});

describe('MovementTypeSchema', () => {
  it('rejects an unknown movement type', () => {
    expect(MovementTypeSchema.safeParse('TELEPORT').success).toBe(false);
  });
});

describe('StockBalanceSchema', () => {
  it('accepts a non-negative balance for a product in a store', () => {
    const result = StockBalanceSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantity: 10,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a negative balance', () => {
    const result = StockBalanceSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantity: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe('PostStockMovementSchema', () => {
  it('accepts a posting of a quantity change against a source document', () => {
    const result = PostStockMovementSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: -2,
      movementType: 'SALE',
      sourceDocument: 'SO-1',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a zero quantity change (a movement must change the balance)', () => {
    const result = PostStockMovementSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 0,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ADJ-1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity change', () => {
    const result = PostStockMovementSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 2.5,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
    });

    expect(result.success).toBe(false);
  });
});
