import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { User } from '@erp/contracts';
import * as database from '@erp/database';
import { ORPCError } from '@orpc/nest';
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

const manager: User = {
  id: 'user-manager',
  email: 'manager01@erp.local',
  name: 'Manager',
  role: 'MANAGER',
  store: null,
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

  it('maps a balance-would-go-negative rejection to a CONFLICT, not a 500', async () => {
    // The real shape Prisma 7 throws for a CHECK violation: a wrapper with the Postgres SQLSTATE
    // nested under meta.driverAdapterError.cause.code.
    const checkViolation = Object.assign(new Error('check constraint'), {
      code: 'P2039',
      meta: { driverAdapterError: { cause: { code: '23514' } } },
    });
    vi.spyOn(database, 'postStockMovement').mockRejectedValue(checkViolation);
    const controller = await createController({});

    try {
      await call(
        controller.post(actor),
        {
          storeId: 'store-b01',
          productId: 'prod1',
          quantityChange: -999,
          movementType: 'SALE',
          sourceDocument: 'SO-1',
        },
        { context: {} },
      );
      expect.unreachable('expected the posting to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe('CONFLICT');
    }
  });

  it('maps a concurrent-update rejection to a CONFLICT, not a 500', async () => {
    const concurrent = new Error('Concurrent stock update detected; the balance changed');
    vi.spyOn(database, 'postStockMovement').mockRejectedValue(concurrent);
    const controller = await createController({});

    try {
      await call(
        controller.post(actor),
        {
          storeId: 'store-b01',
          productId: 'prod1',
          quantityChange: 1,
          movementType: 'RECEIPT',
          sourceDocument: 'PO-1',
        },
        { context: {} },
      );
      expect.unreachable('expected the posting to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe('CONFLICT');
    }
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

  it('adjusts stock with a reason, writing an ADJUSTMENT movement and a SUCCESS audit entry (AC1, NFR-03)', async () => {
    const movement = {
      id: 'mv-adj1',
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 5,
      balanceBefore: 5,
      balanceAfter: 10,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      actorId: 'user-manager',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const post = vi.spyOn(database, 'postStockMovement').mockResolvedValue(movement as never);
    const auditLog = { id: 'audit1' };
    const recordAudit = vi.spyOn(database, 'recordAudit').mockResolvedValue(auditLog as never);
    const controller = await createController({});

    const result = await call(
      controller.adjust(manager),
      {
        storeId: 'store-b01',
        productId: 'prod1',
        quantityChange: 5,
        reason: 'ตรวจนับสต็อกพบส่วนต่าง',
      },
      { context: {} },
    );

    expect(result).toMatchObject({ movementType: 'ADJUSTMENT', quantityChange: 5 });
    // The reason is the adjustment's source document; the movement type is fixed, never taken
    // from the request.
    expect(post).toHaveBeenCalledWith(expect.anything(), {
      storeId: 'store-b01',
      productId: 'prod1',
      quantityChange: 5,
      movementType: 'ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      actorId: 'user-manager',
    });
    // The adjustment is audited with actor, source document (reason) and outcome (AC4, NFR-03).
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), {
      actorId: 'user-manager',
      action: 'STOCK_ADJUSTMENT',
      sourceDocument: 'ตรวจนับสต็อกพบส่วนต่าง',
      outcome: 'SUCCESS',
    });
  });

  it('rejects a reduction greater than the available balance and still audits the rejection (AC2, AC4)', async () => {
    const checkViolation = Object.assign(new Error('check constraint'), {
      code: 'P2039',
      meta: { driverAdapterError: { cause: { code: '23514' } } },
    });
    vi.spyOn(database, 'postStockMovement').mockRejectedValue(checkViolation);
    const recordAudit = vi.spyOn(database, 'recordAudit').mockResolvedValue({} as never);
    const controller = await createController({});

    try {
      await call(
        controller.adjust(manager),
        {
          storeId: 'store-b01',
          productId: 'prod1',
          quantityChange: -999,
          reason: 'นับสต็อกผิดพลาด',
        },
        { context: {} },
      );
      expect.unreachable('expected the adjustment to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe('CONFLICT');
    }

    // Rejected and no movement is written (AC2), but the attempt is still audited (AC4, NFR-03).
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), {
      actorId: 'user-manager',
      action: 'STOCK_ADJUSTMENT',
      sourceDocument: 'นับสต็อกผิดพลาด',
      outcome: 'REJECTED',
    });
  });

  it('rejects an adjustment with no reason before reaching the posting mechanism', async () => {
    const post = vi.spyOn(database, 'postStockMovement');
    const controller = await createController({});

    await expect(
      call(
        controller.adjust(manager),
        { storeId: 'store-b01', productId: 'prod1', quantityChange: 5, reason: '' },
        { context: {} },
      ),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('restricts adjusting to Managers (a store employee or administrator is rejected by the guard, AC3)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StockController.prototype.adjust)).toEqual(['MANAGER']);
  });
});
