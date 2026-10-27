import { describe, expect, it } from 'vitest';
import {
  AdjustStockSchema,
  ListStockMovementsSchema,
  MovementTypeSchema,
  PostStockMovementSchema,
  StockBalanceSchema,
  StockMovementSchema,
} from './stock.js';

// A movement with every field, including the historical-fidelity snapshot (ticket #19).
const validMovement = {
  id: 'mv1',
  storeId: 'store-b01',
  productId: 'prod1',
  quantityChange: 8,
  balanceBefore: 10,
  balanceAfter: 18,
  movementType: 'RECEIPT',
  sourceDocument: 'PO-DEMO-001',
  productNameSnapshot: 'Widget',
  sellingPriceMinorSnapshot: 12500,
  actorId: 'user1',
  createdAt: new Date().toISOString(),
};

describe('StockMovementSchema', () => {
  it('accepts a movement that records product, store, change, before/after, type, source, actor and time', () => {
    const result = StockMovementSchema.safeParse(validMovement);

    expect(result.success).toBe(true);
  });

  it('accepts a Date createdAt from the handler and normalises it to an ISO string', () => {
    const result = StockMovementSchema.safeParse({
      ...validMovement,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.data?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a fractional quantity change', () => {
    const result = StockMovementSchema.safeParse({
      ...validMovement,
      quantityChange: 1.5,
      balanceAfter: 11,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative resulting balance', () => {
    const result = StockMovementSchema.safeParse({
      ...validMovement,
      quantityChange: -20,
      balanceAfter: -10,
      movementType: 'SALE',
      sourceDocument: 'SO-1',
    });

    expect(result.success).toBe(false);
  });

  // Historical snapshot fidelity (ticket #19, TOR 4.3): the product name and price a movement
  // recorded travel with the movement itself, not as a live reference to the product.
  it('requires the product name and selling price snapshot it recorded (AC1)', () => {
    const { productNameSnapshot: _name, ...withoutName } = validMovement;
    expect(StockMovementSchema.safeParse(withoutName).success).toBe(false);

    const { sellingPriceMinorSnapshot: _price, ...withoutPrice } = validMovement;
    expect(StockMovementSchema.safeParse(withoutPrice).success).toBe(false);
  });

  it('rejects a negative selling price snapshot', () => {
    const result = StockMovementSchema.safeParse({
      ...validMovement,
      sellingPriceMinorSnapshot: -1,
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

describe('ListStockMovementsSchema', () => {
  it('accepts a historical search for one product in one store (AC3)', () => {
    const result = ListStockMovementsSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a missing product', () => {
    const result = ListStockMovementsSchema.safeParse({ storeId: 'store-b01', productId: '' });

    expect(result.success).toBe(false);
  });
});

describe('AdjustStockSchema', () => {
  it('accepts a manager adjustment with a nonzero change and a reason (INV-05)', () => {
    const result = AdjustStockSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 5,
      reason: 'ตรวจนับสต็อกพบส่วนต่าง',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a decrease', () => {
    const result = AdjustStockSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: -2,
      reason: 'สินค้าเสียหาย',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a missing reason (the reason is mandatory, INV-05)', () => {
    const result = AdjustStockSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 5,
      reason: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a zero quantity change (an adjustment must change the balance)', () => {
    const result = AdjustStockSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 0,
      reason: 'ตรวจนับสต็อกพบส่วนต่าง',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity change', () => {
    const result = AdjustStockSchema.safeParse({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 2.5,
      reason: 'ตรวจนับสต็อกพบส่วนต่าง',
    });

    expect(result.success).toBe(false);
  });
});
