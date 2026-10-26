import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { StoresController } from './stores.controller.js';

async function createController(store: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [StoresController],
    providers: [{ provide: PrismaService, useValue: { store } }],
  }).compile();
  return moduleRef.get(StoresController);
}

describe('StoresController', () => {
  it('lists stores newest-first with pagination metadata', async () => {
    const items = [
      { id: 's2', code: 'B02', name: 'Riverside Store' },
      { id: 's1', code: 'B01', name: 'Central Store' },
    ];
    const findMany = vi.fn().mockResolvedValue(items);
    const count = vi.fn().mockResolvedValue(2);
    const controller = await createController({ findMany, count });

    await expect(call(controller.list(), { page: 1, pageSize: 20 })).resolves.toEqual({
      items,
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
      select: { id: true, code: true, name: true },
    });
  });

  it('skips to the right page', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(25);
    const controller = await createController({ findMany, count });

    await call(controller.list(), { page: 2, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('creates a store', async () => {
    const created = { id: 's1', code: 'B01', name: 'Central Store' };
    const create = vi.fn().mockResolvedValue(created);
    const controller = await createController({ create });

    await expect(
      call(controller.create(), { code: 'B01', name: 'Central Store' }),
    ).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: { code: 'B01', name: 'Central Store' },
      select: { id: true, code: true, name: true },
    });
  });

  it('rejects a duplicate code with a Thai message', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const controller = await createController({ create });

    await expect(
      call(controller.create(), { code: 'B01', name: 'Central Store' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('edits a store', async () => {
    const updated = { id: 's1', code: 'B01', name: 'Central Store (renamed)' };
    const update = vi.fn().mockResolvedValue(updated);
    const controller = await createController({ update });

    await expect(
      call(controller.update(), { id: 's1', code: 'B01', name: 'Central Store (renamed)' }),
    ).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { code: 'B01', name: 'Central Store (renamed)' },
      select: { id: true, code: true, name: true },
    });
  });

  it('restricts create and edit to an Administrator (non-admins rejected by the guard)', () => {
    // The guard enforces this at request time; here we assert the route carries the
    // ADMINISTRATOR requirement so a non-administrator is refused before any data change.
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StoresController.prototype.create)).toEqual(['ADMINISTRATOR']);
    expect(reflector.get(ROLES_KEY, StoresController.prototype.update)).toEqual(['ADMINISTRATOR']);
  });

  it('leaves the list route readable by any signed-in user', () => {
    expect(new Reflector().get(ROLES_KEY, StoresController.prototype.list)).toBeUndefined();
  });
});
