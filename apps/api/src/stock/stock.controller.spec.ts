import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { User } from '@erp/contracts';
import * as database from '@erp/database';
import { call } from '@orpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { StockController } from './stock.controller.js';

const actor: User = {
  id: 'user1',
  email: 'staff_b01@erp.local',
  name: 'Store Employee B01',
  role: 'STORE_EMPLOYEE',
  store: { id: 'store-b01', code: 'B01', name: 'Branch 01' },
};

async function createController(prisma: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [StockController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(StockController);
}

describe('StockController', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts a movement that records product, store, change, before/after, type, source and actor', async () => {
    const movement = {
      id: 'mv1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId: 'user1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const post = vi.spyOn(database, 'postStockMovement').mockResolvedValue(movement as never);
    const controller = await createController({});

    const result = await call(
      controller.post(actor),
      {
        storeId: 'store-b01',
        productId: 'prod1',
        quantityChange: 8,
        movementType: 'RECEIPT',
        sourceDocument: 'PO-1',
      },
      { context: {} },
    );

    expect(result).toMatchObject({
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId: 'user1',
    });
    // The movement carries a timestamp (normalised to an ISO string by the contract).
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    // The actor is derived from the signed-in user, never taken from request input.
    expect(post).toHaveBeenCalledWith(expect.anything(), {
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 8,
      movementType: 'RECEIPT',
      sourceDocument: 'PO-1',
      actorId: 'user1',
    });
  });

  it('lists the stock balances in a store', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { storeId: 'store-b01', productId: 'prod1', quantity: 10 },
      { storeId: 'store-b01', productId: 'prod2', quantity: 5 },
    ]);
    const controller = await createController({ stockBalance: { findMany } });

    await expect(
      call(controller.listBalances(), { storeId: 'store-b01' }, { context: {} }),
    ).resolves.toEqual([
      { storeId: 'store-b01', productId: 'prod1', quantity: 10 },
      { storeId: 'store-b01', productId: 'prod2', quantity: 5 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-b01' },
      select: { storeId: true, productId: true, quantity: true },
    });
  });

  it('rejects a zero quantity change before reaching the posting mechanism', async () => {
    const post = vi.spyOn(database, 'postStockMovement');
    const controller = await createController({});

    await expect(
      call(
        controller.post(actor),
        {
          storeId: 'store-b01',
          productId: 'prod1',
          quantityChange: 0,
          movementType: 'ADJUSTMENT',
          sourceDocument: 'ADJ-1',
        },
        { context: {} },
      ),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('exposes no route to edit or delete a movement (confirmed movements are immutable)', () => {
    const routes = Object.getOwnPropertyNames(StockController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(routes).toContain('post');
    expect(routes).toContain('listBalances');
    expect(routes.some((name) => /update|edit|delete|remove/i.test(name))).toBe(false);
  });

  it('restricts posting to stock-handling roles (others rejected by the guard)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StockController.prototype.post)).toEqual([
      'STORE_EMPLOYEE',
      'MANAGER',
      'ADMINISTRATOR',
    ]);
  });
});
