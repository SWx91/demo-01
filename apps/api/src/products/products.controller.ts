import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { isSkuEditable } from '@erp/database';
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
    return implement(contract.products.update).handler(async ({ input }) => {
      const { id, sku, ...data } = input;
      const existing = await this.prisma.product.findUniqueOrThrow({
        where: { id },
        select: { sku: true },
      });

      // MD-01: the SKU can still be corrected until a stock movement references the product;
      // past that point it is frozen while every other field here stays editable.
      if (!(await isSkuEditable(this.prisma, id, existing.sku, sku))) {
        throw new ORPCError('CONFLICT', {
          message: `ไม่สามารถเปลี่ยนรหัสสินค้า (SKU) จาก "${existing.sku}" ได้ เนื่องจากมีการเคลื่อนไหวสต็อกอ้างอิงสินค้านี้แล้ว`,
        });
      }

      return withDuplicateSkuGuard(sku, () =>
        this.prisma.product.update({
          where: { id },
          data: { sku, ...data },
          select: PRODUCT_SELECT,
        }),
      );
    });
  }

  @Roles('ADMINISTRATOR')
  @Implement(contract.products.setActive)
  setActive() {
    // Deactivating keeps the product in the catalogue and searchable (MD-02); it only stops the
    // product from being added to new documents, enforced by the shared `assertProductActive`
    // guard. Reactivating lets it be added again.
    return implement(contract.products.setActive).handler(({ input }) =>
      this.prisma.product.update({
        where: { id: input.id },
        data: { active: input.active },
        select: PRODUCT_SELECT,
      }),
    );
  }

  @Implement(contract.products.search)
  search() {
    return implement(contract.products.search).handler(({ input }) =>
      this.prisma.product.findMany({
        where: {
          // activeOnly defaults to false so historical searches still surface deactivated
          // products (MD-02). Only a picker for a new document sets activeOnly to hide them.
          ...(input.activeOnly ? { active: true } : {}),
          ...(input.query
            ? {
                OR: [
                  { sku: { contains: input.query, mode: 'insensitive' as const } },
                  { name: { contains: input.query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy: { sku: 'asc' },
        select: PRODUCT_SELECT,
      }),
    );
  }
}
