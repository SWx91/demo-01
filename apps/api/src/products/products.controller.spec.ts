import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { ProductsController } from './products.controller.js';

async function createController(
  product: Record<string, unknown>,
  rest: Record<string, Record<string, unknown>> = {},
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [{ provide: PrismaService, useValue: { product, ...rest } }],
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

  it('edits a product, updating the SKU and the mutable fields by id (AC1: no movement yet)', async () => {
    const updated = {
      id: 'prod1',
      ...input,
      sku: 'SKU-002',
      name: 'Jasmine Rice 10kg',
      sellingPriceMinor: 24000,
    };
    const update = vi.fn().mockResolvedValue(updated);
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ sku: 'SKU-001' });
    const count = vi.fn().mockResolvedValue(0);
    const controller = await createController(
      { update, findUniqueOrThrow },
      { stockMovement: { count } },
    );

    await expect(
      call(controller.update(), {
        id: 'prod1',
        sku: 'SKU-002',
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 24000,
        active: true,
      }),
    ).resolves.toEqual(updated);
    expect(count).toHaveBeenCalledWith({ where: { productId: 'prod1' } });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'prod1' },
      data: {
        sku: 'SKU-002',
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 24000,
        active: true,
      },
      select: PRODUCT_SELECT,
    });
  });

  it('rejects changing the SKU once a movement references the product, with a Thai CONFLICT (AC2)', async () => {
    const update = vi.fn();
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ sku: 'SKU-001' });
    const count = vi.fn().mockResolvedValue(1);
    const controller = await createController(
      { update, findUniqueOrThrow },
      { stockMovement: { count } },
    );

    await expect(
      call(controller.update(), {
        id: 'prod1',
        sku: 'SKU-999',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('SKU-001') });
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves other fields editable once the SKU is frozen, as long as the SKU is unchanged (AC3)', async () => {
    const updated = { id: 'prod1', ...input, sku: 'SKU-001', name: 'Jasmine Rice 10kg' };
    const update = vi.fn().mockResolvedValue(updated);
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ sku: 'SKU-001' });
    const count = vi.fn().mockResolvedValue(1);
    const controller = await createController(
      { update, findUniqueOrThrow },
      { stockMovement: { count } },
    );

    await expect(
      call(controller.update(), {
        id: 'prod1',
        sku: 'SKU-001',
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      }),
    ).resolves.toEqual(updated);
    // The SKU never changed, so the movement count is never even consulted.
    expect(count).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'prod1' },
      data: {
        sku: 'SKU-001',
        name: 'Jasmine Rice 10kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      },
      select: PRODUCT_SELECT,
    });
  });

  it('rejects an edit whose new SKU collides with another product, with a Thai CONFLICT', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ sku: 'SKU-001' });
    const count = vi.fn().mockResolvedValue(0);
    const controller = await createController(
      { update, findUniqueOrThrow },
      { stockMovement: { count } },
    );

    await expect(
      call(controller.update(), {
        id: 'prod1',
        sku: 'SKU-002',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a negative selling price on edit before reaching Prisma', async () => {
    const update = vi.fn();
    const findUniqueOrThrow = vi.fn();
    const controller = await createController({ update, findUniqueOrThrow });

    await expect(
      call(controller.update(), {
        id: 'prod1',
        sku: 'SKU-001',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: -1,
        active: true,
      }),
    ).rejects.toThrow();
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('restricts edit to an Administrator (non-admins rejected by the guard)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, ProductsController.prototype.update)).toEqual([
      'ADMINISTRATOR',
    ]);
  });

  it('deactivates a product by id, keeping it in the catalogue', async () => {
    const deactivated = { id: 'prod3', ...input, sku: 'SKU003', active: false };
    const update = vi.fn().mockResolvedValue(deactivated);
    const controller = await createController({ update });

    await expect(call(controller.setActive(), { id: 'prod3', active: false })).resolves.toEqual(
      deactivated,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'prod3' },
      data: { active: false },
      select: PRODUCT_SELECT,
    });
  });

  it('reactivates a product by id', async () => {
    const reactivated = { id: 'prod3', ...input, sku: 'SKU003', active: true };
    const update = vi.fn().mockResolvedValue(reactivated);
    const controller = await createController({ update });

    await expect(call(controller.setActive(), { id: 'prod3', active: true })).resolves.toEqual(
      reactivated,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'prod3' },
      data: { active: true },
      select: PRODUCT_SELECT,
    });
  });

  it('restricts deactivate/reactivate to an Administrator', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, ProductsController.prototype.setActive)).toEqual([
      'ADMINISTRATOR',
    ]);
  });

  it('historical search returns inactive products too (deactivated SKU003 still found)', async () => {
    // activeOnly defaults to false, so a historical search must not filter on active status.
    const deactivated = {
      id: 'prod3',
      ...input,
      sku: 'SKU003',
      name: 'Laundry detergent',
      active: false,
    };
    const findMany = vi.fn().mockResolvedValue([deactivated]);
    const controller = await createController({ findMany });

    await expect(call(controller.search(), { query: 'SKU003' })).resolves.toEqual([deactivated]);
    const where = findMany.mock.calls[0]?.[0].where;
    // The query filters by text but never constrains `active` on a historical search.
    expect(where.active).toBeUndefined();
  });

  it('a picker search (activeOnly) constrains to active products only', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = await createController({ findMany });

    await call(controller.search(), { query: 'rice', activeOnly: true });

    expect(findMany.mock.calls[0]?.[0].where.active).toBe(true);
  });
});
