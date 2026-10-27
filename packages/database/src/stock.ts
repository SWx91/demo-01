import type { MovementType, PrismaClient, StockMovement } from './generated/prisma/client.js';

/**
 * Everything needed to post one stock change. The caller supplies the signed change, why, the
 * source document and who is posting; the resulting balances are computed here, never trusted from
 * the caller.
 */
export interface PostStockMovementInput {
  storeId: string;
  productId: string;
  quantityChange: number;
  movementType: MovementType;
  sourceDocument: string;
  actorId: string;
}

/** A Prisma client or an interactive transaction client — the function works through either. */
type PrismaLike = Pick<PrismaClient, '$transaction' | 'stockBalance' | 'stockMovement'>;

/**
 * The single mechanism every stock change in the product goes through. In one database
 * transaction it reads the current balance, computes the new balance, writes it with a guarded
 * conditional update (matched on the row's `version` so a concurrent write cannot be lost —
 * INV-04), and records an immutable movement with the balance before and after (INV-02, US-13).
 * It either all commits or all rolls back (INV-03). The database's own CHECK refuses to let the
 * balance go negative, so an over-withdrawal fails the whole posting rather than being clamped.
 */
export async function postStockMovement(
  prisma: PrismaLike,
  input: PostStockMovementInput,
): Promise<StockMovement> {
  const { storeId, productId, quantityChange, movementType, sourceDocument, actorId } = input;

  return prisma.$transaction(async (tx) => {
    const current = await tx.stockBalance.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });

    const balanceBefore = current?.quantity ?? 0;
    const balanceAfter = balanceBefore + quantityChange;

    if (current) {
      // Guarded conditional update: only touch the row if its version is still the one we read.
      // If a racing posting moved it first, this updates zero rows and we reject rather than
      // overwrite the other update (INV-04). The DB CHECK rejects a negative balanceAfter (INV-03).
      const { count } = await tx.stockBalance.updateMany({
        where: { storeId, productId, version: current.version },
        data: { quantity: balanceAfter, version: { increment: 1 } },
      });
      if (count !== 1) {
        throw new Error(
          'Concurrent stock update detected; the balance changed underneath this posting',
        );
      }
    } else {
      // No balance row yet: create it at the resulting quantity. The CHECK still guards negatives.
      await tx.stockBalance.create({
        data: { storeId, productId, quantity: balanceAfter, version: 1 },
      });
    }

    return tx.stockMovement.create({
      data: {
        storeId,
        productId,
        quantityChange,
        balanceBefore,
        balanceAfter,
        movementType,
        sourceDocument,
        actorId,
      },
    });
  });
}
