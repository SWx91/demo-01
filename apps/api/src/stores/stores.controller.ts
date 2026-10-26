import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's StoreSchema exposes. */
const STORE_SELECT = { id: true, code: true, name: true } as const;

/** Prisma throws this when a @unique column (here, Store.code) collides. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

@Controller()
export class StoresController {
  constructor(private readonly prisma: PrismaService) {}

  @Implement(contract.stores.list)
  list() {
    return implement(contract.stores.list).handler(async ({ input }) => {
      const { page, pageSize } = input;
      const [items, total] = await Promise.all([
        this.prisma.store.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: STORE_SELECT,
        }),
        this.prisma.store.count(),
      ]);
      return { items, total, page, pageSize };
    });
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.stores.create)
  create() {
    return implement(contract.stores.create).handler(async ({ input }) => {
      try {
        return await this.prisma.store.create({ data: input, select: STORE_SELECT });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ORPCError('CONFLICT', { message: `รหัสสาขา "${input.code}" มีอยู่แล้ว` });
        }
        throw error;
      }
    });
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.stores.update)
  update() {
    return implement(contract.stores.update).handler(async ({ input }) => {
      const { id, ...data } = input;
      try {
        return await this.prisma.store.update({ where: { id }, data, select: STORE_SELECT });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ORPCError('CONFLICT', { message: `รหัสสาขา "${input.code}" มีอยู่แล้ว` });
        }
        throw error;
      }
    });
  }
}
