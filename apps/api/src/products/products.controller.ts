import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's ProductSchema exposes. */
const PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  unit: true,
  sellingPriceMinor: true,
  active: true,
} as const;

/**
 * Prisma throws P2002 when a @unique column (here, Product.sku) collides. Translate it into a
 * Thai CONFLICT the client can show; re-throw anything else untouched.
 */
async function withDuplicateSkuGuard<T>(sku: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
    if (isUniqueViolation) {
      throw new ORPCError('CONFLICT', { message: `รหัสสินค้า (SKU) "${sku}" มีอยู่แล้ว` });
    }
    throw error;
  }
}

@Controller()
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMINISTRATOR')
  @Implement(contract.products.create)
  create() {
    return implement(contract.products.create).handler(({ input }) =>
      withDuplicateSkuGuard(input.sku, () =>
        this.prisma.product.create({ data: input, select: PRODUCT_SELECT }),
      ),
    );
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.products.update)
  update() {
    return implement(contract.products.update).handler(({ input }) => {
      const { id, ...data } = input;
      return this.prisma.product.update({ where: { id }, data, select: PRODUCT_SELECT });
    });
  }
}
