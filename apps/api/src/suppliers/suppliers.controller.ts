import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's SupplierSchema exposes. */
const SUPPLIER_SELECT = {
  id: true,
  code: true,
  name: true,
  contactName: true,
  phone: true,
  email: true,
  address: true,
} as const;

/** Optional contact fields the client may omit; stored as null when absent. */
type ContactInput = {
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
};

/** Normalise optional contact fields: a blank (already trimmed by the contract) becomes null. */
function toContactData(input: ContactInput) {
  const orNull = (value: string | undefined) => (value ? value : null);
  return {
    contactName: orNull(input.contactName),
    phone: orNull(input.phone),
    email: orNull(input.email),
    address: orNull(input.address),
  };
}

/**
 * Prisma throws P2002 when a @unique column (here, Supplier.code) collides. Translate it into a
 * Thai CONFLICT the client can show; re-throw anything else untouched.
 */
async function withDuplicateCodeGuard<T>(code: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
    if (isUniqueViolation) {
      throw new ORPCError('CONFLICT', { message: `รหัสผู้จัดจำหน่าย "${code}" มีอยู่แล้ว` });
    }
    throw error;
  }
}

@Controller()
export class SuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  @Implement(contract.suppliers.list)
  list() {
    return implement(contract.suppliers.list).handler(async ({ input }) => {
      const { page, pageSize } = input;
      const [items, total] = await Promise.all([
        this.prisma.supplier.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: SUPPLIER_SELECT,
        }),
        this.prisma.supplier.count(),
      ]);
      return { items, total, page, pageSize };
    });
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.suppliers.create)
  create() {
    return implement(contract.suppliers.create).handler(({ input }) =>
      withDuplicateCodeGuard(input.code, () =>
        this.prisma.supplier.create({
          data: { code: input.code, name: input.name, ...toContactData(input) },
          select: SUPPLIER_SELECT,
        }),
      ),
    );
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.suppliers.update)
  update() {
    return implement(contract.suppliers.update).handler(({ input }) =>
      withDuplicateCodeGuard(input.code, () =>
        this.prisma.supplier.update({
          where: { id: input.id },
          data: { code: input.code, name: input.name, ...toContactData(input) },
          select: SUPPLIER_SELECT,
        }),
      ),
    );
  }
}
