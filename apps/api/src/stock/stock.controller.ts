import { Controller } from '@nestjs/common';
import { contract, type User } from '@erp/contracts';
import { postStockMovement } from '@erp/database';
import { Implement, implement } from '@orpc/nest';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's StockBalanceSchema exposes. */
const STOCK_BALANCE_SELECT = {
  storeId: true,
  productId: true,
  quantity: true,
} as const;

@Controller()
export class StockController {
  constructor(private readonly prisma: PrismaService) {}

  // Posting stock is restricted to the roles that handle inventory. The actor is taken from the
  // signed-in user, never from the request.
  @Roles('STORE_EMPLOYEE', 'MANAGER', 'ADMINISTRATOR')
  @Implement(contract.stock.post)
  post(@CurrentUser() user: User) {
    return implement(contract.stock.post).handler(({ input }) =>
      // The single mechanism every stock change goes through: atomic balance update + immutable
      // movement, with the database guarding against negative balances and lost updates.
      postStockMovement(this.prisma, { ...input, actorId: user.id }),
    );
  }

  @Implement(contract.stock.listBalances)
  listBalances() {
    return implement(contract.stock.listBalances).handler(({ input }) =>
      this.prisma.stockBalance.findMany({
        where: { storeId: input.storeId },
        select: STOCK_BALANCE_SELECT,
      }),
    );
  }
}
