import { Controller } from '@nestjs/common';
import { contract } from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

@Controller()
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMINISTRATOR')
  @Implement(contract.products.create)
  create() {
    return implement(contract.products.create).handler(({ input }) =>
      this.prisma.product.create({ data: input }),
    );
  }
}
