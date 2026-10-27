import type { Product } from '@erp/contracts';
import { ORPCError } from '@orpc/nest';

/** The product fields the guard needs to identify and check a product, derived from the contract. */
type ActiveCheckProduct = Pick<Product, 'sku' | 'name' | 'active'>;

/**
 * The shared rule that keeps a deactivated product out of new documents (US-07). A deactivated
 * product stays in the catalogue and remains searchable in historical records (MD-02); this guard
 * is the single gate that refuses it when it is being added to a *new* document. The
 * purchasing/receiving and sales flows reuse this helper rather than re-checking `active`
 * themselves, so the rule and its Thai, actionable message live in one place.
 *
 * Throws a `BAD_REQUEST` ORPCError naming the product when it is inactive; returns nothing when the
 * product is active.
 */
export function assertProductActive(product: ActiveCheckProduct): void {
  if (!product.active) {
    throw new ORPCError('BAD_REQUEST', {
      message: `สินค้า "${product.name}" (${product.sku}) ถูกปิดใช้งาน ไม่สามารถเพิ่มลงในเอกสารใหม่ได้ กรุณาเปิดใช้งานสินค้าก่อน`,
    });
  }
}
