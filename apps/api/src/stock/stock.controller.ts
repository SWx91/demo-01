import { Controller } from '@nestjs/common';
import { contract, type User } from '@erp/contracts';
import { postStockMovement, recordAudit } from '@erp/database';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../database/prisma.service.js';

/** The audit `action` recorded for every manager stock adjustment (NFR-03). */
const ADJUSTMENT_AUDIT_ACTION = 'STOCK_ADJUSTMENT';

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

  // A Manager adjustment is a distinct route from the general post above: it is restricted to
  // Managers only (INV-05; a store employee or administrator is refused, not just any non-manager
  // such as a purchasing officer), the reason is mandatory (enforced by the contract), and every
  // attempt — successful or rejected — leaves an audit entry (NFR-03), independent of whatever
  // happened to the stock-posting transaction itself.
  @Roles('MANAGER')
  @Implement(contract.stock.adjust)
  adjust(@CurrentUser() user: User) {
    return implement(contract.stock.adjust).handler(async ({ input }) => {
      const { storeId, productId, quantityChange, reason } = input;
      try {
        // The reason is the adjustment's source document: a manual correction has no separate
        // paper document, so the reason given fills that role on the resulting movement.
        const movement = await postStockMovement(this.prisma, {
          storeId,
          productId,
          quantityChange,
          movementType: 'ADJUSTMENT',
          sourceDocument: reason,
          actorId: user.id,
        });
        await recordAudit(this.prisma, {
          actorId: user.id,
          action: ADJUSTMENT_AUDIT_ACTION,
          sourceDocument: reason,
          outcome: 'SUCCESS',
        });
        return movement;
      } catch (error) {
        // The posting rolled back (e.g. a reduction greater than the available balance), so no
        // movement exists to audit. The attempt is still audited, in its own write, so the
        // rejection is never silently lost.
        await recordAudit(this.prisma, {
          actorId: user.id,
          action: ADJUSTMENT_AUDIT_ACTION,
          sourceDocument: reason,
          outcome: 'REJECTED',
        });
        throw toPostingError(error);
      }
    });
  }
}
