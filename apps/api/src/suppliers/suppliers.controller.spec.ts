import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { SuppliersController } from './suppliers.controller.js';

async function createController(supplier: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [SuppliersController],
    providers: [{ provide: PrismaService, useValue: { supplier } }],
  }).compile();
  return moduleRef.get(SuppliersController);
}

const SELECT = {
  id: true,
  code: true,
  name: true,
  contactName: true,
  phone: true,
  address: true,
  email: true,
};

describe('SuppliersController', () => {
  it('lists suppliers newest-first with pagination metadata', async () => {
    const items = [
      {
        id: 'sup2',
        code: 'SUP02',
        name: 'Second Co',
        contactName: null,
        phone: null,
        email: null,
        address: null,
      },
      {
        id: 'sup1',
        code: 'SUP01',
        name: 'SupplyOne Co Ltd',
        contactName: 'Somchai',
        phone: '02-123-4567',
        email: 'sales@supplyone.co.th',
        address: 'Bangkok',
      },
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
      select: SELECT,
    });
  });

  it('skips to the right page', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(25);
    const controller = await createController({ findMany, count });

    await call(controller.list(), { page: 2, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('creates a supplier with contact details, normalising omitted fields to null', async () => {
    const created = {
      id: 'sup1',
      code: 'SUP01',
      name: 'SupplyOne Co Ltd',
      contactName: 'Somchai',
      phone: '02-123-4567',
      email: 'sales@supplyone.co.th',
      address: 'Bangkok',
    };
    const create = vi.fn().mockResolvedValue(created);
    const controller = await createController({ create });

    await expect(
      call(controller.create(), {
        code: 'SUP01',
        name: 'SupplyOne Co Ltd',
        contactName: 'Somchai',
        phone: '02-123-4567',
        email: 'sales@supplyone.co.th',
        address: 'Bangkok',
      }),
    ).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: {
        code: 'SUP01',
        name: 'SupplyOne Co Ltd',
        contactName: 'Somchai',
        phone: '02-123-4567',
        email: 'sales@supplyone.co.th',
        address: 'Bangkok',
      },
      select: SELECT,
    });
  });

  it('creates a supplier with only a code and name', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'sup1', code: 'SUP01', name: 'SupplyOne Co Ltd' });
    const controller = await createController({ create });

    await call(controller.create(), { code: 'SUP01', name: 'SupplyOne Co Ltd' });

    expect(create).toHaveBeenCalledWith({
      data: {
        code: 'SUP01',
        name: 'SupplyOne Co Ltd',
        contactName: null,
        phone: null,
        email: null,
        address: null,
      },
      select: SELECT,
    });
  });

  it('normalises blank contact fields to null, trimming the rest', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'sup1', code: 'SUP01', name: 'SupplyOne Co Ltd' });
    const controller = await createController({ create });

    await call(controller.create(), {
      code: 'SUP01',
      name: 'SupplyOne Co Ltd',
      contactName: '',
      phone: '  02-123-4567  ',
      email: '',
      address: '   ',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        code: 'SUP01',
        name: 'SupplyOne Co Ltd',
        contactName: null,
        phone: '02-123-4567',
        email: null,
        address: null,
      },
      select: SELECT,
    });
  });

  it('rejects a duplicate code with a Thai CONFLICT', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const controller = await createController({ create });

    await expect(
      call(controller.create(), { code: 'SUP01', name: 'SupplyOne Co Ltd' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('edits a supplier', async () => {
    const updated = {
      id: 'sup1',
      code: 'SUP01',
      name: 'SupplyOne Co Ltd (renamed)',
      contactName: null,
      phone: null,
      email: null,
      address: null,
    };
    const update = vi.fn().mockResolvedValue(updated);
    const controller = await createController({ update });

    await expect(
      call(controller.update(), { id: 'sup1', code: 'SUP01', name: 'SupplyOne Co Ltd (renamed)' }),
    ).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'sup1' },
      data: {
        code: 'SUP01',
        name: 'SupplyOne Co Ltd (renamed)',
        contactName: null,
        phone: null,
        email: null,
        address: null,
      },
      select: SELECT,
    });
  });

  it('restricts create and edit to an Administrator (non-admins rejected by the guard)', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, SuppliersController.prototype.create)).toEqual([
      'ADMINISTRATOR',
    ]);
    expect(reflector.get(ROLES_KEY, SuppliersController.prototype.update)).toEqual([
      'ADMINISTRATOR',
    ]);
  });

  it('leaves the list route readable by any signed-in user', () => {
    expect(new Reflector().get(ROLES_KEY, SuppliersController.prototype.list)).toBeUndefined();
  });
});
