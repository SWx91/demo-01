import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's StoreProductSchema exposes. */
const STORE_PRODUCT_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  reorderThreshold: true,
} as const;

@Controller()
export class StoreProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMINISTRATOR')
  @Implement(contract.storeProducts.setReorderThreshold)
  setReorderThreshold() {
    return implement(contract.storeProducts.setReorderThreshold).handler(({ input }) => {
      const { storeId, productId, reorderThreshold } = input;
      // Upsert on the (store, product) row so setting is idempotent per store and so the same
      // product keeps a separate threshold in each store.
      return this.prisma.storeProduct.upsert({
        where: { storeId_productId: { storeId, productId } },
        create: { storeId, productId, reorderThreshold },
        update: { reorderThreshold },
        select: STORE_PRODUCT_SELECT,
      });
    });
  }
}
