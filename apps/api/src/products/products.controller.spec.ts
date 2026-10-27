import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
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

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  unit: true,
  sellingPriceMinor: true,
  active: true,
};

describe('ProductsController', () => {
  it('creates a product, passing the input through to Prisma', async () => {
    const created = { id: 'prod1', ...input };
    const create = vi.fn().mockResolvedValue(created);
    const controller = await createController({ create });

    await expect(call(controller.create(), input)).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({ data: input, select: PRODUCT_SELECT });
  });

  it('rejects a duplicate SKU with a Thai CONFLICT', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const controller = await createController({ create });

    await expect(call(controller.create(), input)).rejects.toMatchObject({ code: 'CONFLICT' });
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

  it('restricts create to an Administrator (non-admins rejected by the guard)', () => {
    // The guard enforces this at request time; here we assert the route carries the
    // ADMINISTRATOR requirement so a non-administrator is refused before any data change.
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, ProductsController.prototype.create)).toEqual([
      'ADMINISTRATOR',
    ]);
  });

  it('edits a product, updating the mutable fields by id', async () => {
    const updated = { id: 'prod1', ...input, name: 'Jasmine Rice 10kg', sellingPriceMinor: 24000 };
    const update = vi.fn().mockResolvedValue(updated);
    const controller = await createController({ update });

    await expect(
      call(controller.update(), {
        id: 'prod1',
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 24000,
        active: true,
      }),
    ).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'prod1' },
      data: {
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 24000,
        active: true,
      },
      select: PRODUCT_SELECT,
    });
  });

  it('rejects a negative selling price on edit before reaching Prisma', async () => {
    const update = vi.fn();
    const controller = await createController({ update });

    await expect(
      call(controller.update(), {
        id: 'prod1',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: -1,
        active: true,
      }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('restricts edit to an Administrator (non-admins rejected by the guard)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, ProductsController.prototype.update)).toEqual([
      'ADMINISTRATOR',
    ]);
  });
});
