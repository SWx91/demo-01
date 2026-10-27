import { Controller } from '@nestjs/common';
import { contract, type User } from '@erp/contracts';
import { postStockMovement } from '@erp/database';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The fields the contract's StockBalanceSchema exposes. */
const STOCK_BALANCE_SELECT = {
  storeId: true,
  productId: true,
  quantity: true,
} as const;

/** The Postgres error code of the StockBalance non-negative CHECK constraint failing. */
const CHECK_VIOLATION = '23514';
/** The Postgres error code of a serialization failure under Serializable isolation. */
const SERIALIZATION_FAILURE = '40001';

function pgCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  // The pg driver surfaces the SQLSTATE on `.code`. Prisma 7 wraps driver errors and nests the
  // original SQLSTATE under `meta.driverAdapterError.cause.code` (with a sibling `originalCode`),
  // so check the direct code first, then the nested one.
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string' && /^\d{5}$/.test(direct)) return direct;
  const cause = (error as { meta?: { driverAdapterError?: { cause?: Record<string, unknown> } } })
    .meta?.driverAdapterError?.cause;
  const nested = cause?.code ?? cause?.originalCode;
  return typeof nested === 'string' ? nested : undefined;
}

/**
 * Turn the expected posting failures into actionable CONFLICT errors (409) rather than letting
 * them surface as a raw 500. A balance that would go negative and a concurrent update are both
 * business outcomes the caller can act on, not server faults.
 */
function toPostingError(error: unknown): ORPCError<string, unknown> {
  const code = pgCode(error);
  if (code === CHECK_VIOLATION) {
    return new ORPCError('CONFLICT', { message: 'สต็อกคงเหลือไม่พอ ไม่สามารถทำให้ยอดติดลบได้' });
  }
  if (
    code === SERIALIZATION_FAILURE ||
    (error instanceof Error && error.message.includes('Concurrent stock update'))
  ) {
    return new ORPCError('CONFLICT', {
      message: 'มีการปรับสต็อกพร้อมกัน กรุณาลองใหม่อีกครั้ง',
    });
  }
  return error instanceof ORPCError
    ? error
    : new ORPCError('INTERNAL_SERVER_ERROR', { message: 'ไม่สามารถบันทึกการเคลื่อนไหวสต็อกได้' });
}

@Controller()
export class StockController {
  constructor(private readonly prisma: PrismaService) {}

  // Posting stock is restricted to the roles that handle inventory. The actor is taken from the
  // signed-in user, never from the request.
  @Roles('STORE_EMPLOYEE', 'MANAGER', 'ADMINISTRATOR')
  @Implement(contract.stock.post)
  post(@CurrentUser() user: User) {
    return implement(contract.stock.post).handler(async ({ input }) => {
      try {
        // The single mechanism every stock change goes through: atomic balance update + immutable
        // movement, with the database guarding against negative balances and lost updates.
        return await postStockMovement(this.prisma, { ...input, actorId: user.id });
      } catch (error) {
        throw toPostingError(error);
      }
    });
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
