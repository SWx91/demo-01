import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { StoreProductsController } from './store-products.controller.js';

async function createController(storeProduct: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [StoreProductsController],
    providers: [{ provide: PrismaService, useValue: { storeProduct } }],
  }).compile();
  return moduleRef.get(StoreProductsController);
}

const STORE_PRODUCT_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  reorderThreshold: true,
};

describe('StoreProductsController', () => {
  it('sets a reorder threshold on the store-scoped row, keyed on store and product', async () => {
    const row = { id: 'sp1', storeId: 'store-b01', productId: 'prod1', reorderThreshold: 3 };
    const upsert = vi.fn().mockResolvedValue(row);
    const controller = await createController({ upsert });

    await expect(
      call(controller.setReorderThreshold(), {
        storeId: 'store-b01',
        productId: 'prod1',
        reorderThreshold: 3,
      }),
    ).resolves.toEqual(row);
    expect(upsert).toHaveBeenCalledWith({
      where: { storeId_productId: { storeId: 'store-b01', productId: 'prod1' } },
      create: { storeId: 'store-b01', productId: 'prod1', reorderThreshold: 3 },
      update: { reorderThreshold: 3 },
      select: STORE_PRODUCT_SELECT,
    });
  });

  it('keeps thresholds separate per store for the same product (B01 and B02)', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'sp1',
        storeId: 'store-b01',
        productId: 'prod1',
        reorderThreshold: 3,
      })
      .mockResolvedValueOnce({
        id: 'sp2',
        storeId: 'store-b02',
        productId: 'prod1',
        reorderThreshold: 7,
      });
    const controller = await createController({ upsert });

    const b01 = await call(controller.setReorderThreshold(), {
      storeId: 'store-b01',
      productId: 'prod1',
      reorderThreshold: 3,
    });
    const b02 = await call(controller.setReorderThreshold(), {
      storeId: 'store-b02',
      productId: 'prod1',
      reorderThreshold: 7,
    });

    expect(b01.reorderThreshold).toBe(3);
    expect(b02.reorderThreshold).toBe(7);
    expect(b01.storeId).not.toBe(b02.storeId);
    expect(upsert.mock.calls[0]?.[0]?.where).toEqual({
      storeId_productId: { storeId: 'store-b01', productId: 'prod1' },
    });
    expect(upsert.mock.calls[1]?.[0]?.where).toEqual({
      storeId_productId: { storeId: 'store-b02', productId: 'prod1' },
    });
  });

  it('rejects a negative threshold before reaching Prisma', async () => {
    const upsert = vi.fn();
    const controller = await createController({ upsert });

    await expect(
      call(controller.setReorderThreshold(), {
        storeId: 'store-b01',
        productId: 'prod1',
        reorderThreshold: -1,
      }),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('restricts setting the threshold to an Administrator (non-admins rejected by the guard)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StoreProductsController.prototype.setReorderThreshold)).toEqual(
      ['ADMINISTRATOR'],
    );
  });
});
