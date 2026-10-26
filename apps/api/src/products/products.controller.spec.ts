import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { ProductsController } from './products.controller.js';

async function createController(product: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [{ provide: PrismaService, useValue: { product } }],
  }).compile();
  return moduleRef.get(ProductsController);
}

const input = {
  sku: 'SKU-001',
  name: 'Jasmine Rice 5kg',
  category: 'Groceries',
  unit: 'bag',
  sellingPriceMinor: 12500,
  active: true,
};

describe('ProductsController', () => {
  it('creates a product, passing the input through to Prisma', async () => {
    const created = { id: 'prod1', ...input };
    const create = vi.fn().mockResolvedValue(created);
    const controller = await createController({ create });

    await expect(call(controller.create(), input)).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it('preserves the selling price exactly as integer minor units through the contract call', async () => {
    // 12345 minor units = ฿123.45 — no floating-point drift because the value never leaves integers.
    const price = 12345;
    const created = { id: 'prod1', ...input, sellingPriceMinor: price };
    const create = vi.fn().mockResolvedValue(created);
    const controller = await createController({ create });

    const result = await call(controller.create(), { ...input, sellingPriceMinor: price });

    expect(result.sellingPriceMinor).toBe(price);
    expect(Number.isInteger(result.sellingPriceMinor)).toBe(true);
    // Formatting to two decimals for display is exact.
    expect((result.sellingPriceMinor / 100).toFixed(2)).toBe('123.45');
  });

  it('rejects a negative selling price before reaching Prisma', async () => {
    const create = vi.fn();
    const controller = await createController({ create });

    await expect(call(controller.create(), { ...input, sellingPriceMinor: -1 })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a fractional selling price before reaching Prisma', async () => {
    const create = vi.fn();
    const controller = await createController({ create });

    await expect(
      call(controller.create(), { ...input, sellingPriceMinor: 123.45 }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
