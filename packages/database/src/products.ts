import type { PrismaClient } from './generated/prisma/client.js';

/** A Prisma client or an interactive transaction client — the function works through either. */
type PrismaLike = Pick<PrismaClient, 'stockMovement'>;

/**
 * MD-01: a product's SKU can still be corrected until a stock movement references it; past that
 * point it is frozen while every other field stays editable. Resubmitting the same SKU is always
 * allowed, movement or not, so an edit to an unrelated field never trips the freeze — the movement
 * count is only checked when the caller is actually trying to change the value.
 */
export async function isSkuEditable(
  prisma: PrismaLike,
  productId: string,
  currentSku: string,
  nextSku: string,
): Promise<boolean> {
  if (currentSku === nextSku) return true;
  const movementCount = await prisma.stockMovement.count({ where: { productId } });
  return movementCount === 0;
}
