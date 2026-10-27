import type { AuditLog, PrismaClient } from './generated/prisma/client.js';

/**
 * One audit trail entry (NFR-03): who acted, the source document or reason that drove the
 * action, and its outcome. `action` and `outcome` are free text so each audited action (a manager
 * stock adjustment, a PO approval, a goods receipt, a sale) names its own without agreeing on a
 * shared vocabulary up front.
 */
export interface RecordAuditInput {
  actorId: string;
  action: string;
  sourceDocument: string;
  outcome: string;
}

/** A Prisma client or an interactive transaction client. */
type PrismaLike = Pick<PrismaClient, 'auditLog'>;

/**
 * Write one audit trail entry. Established by ticket #17 for manager stock adjustments; the
 * sibling actions NFR-03 names (purchase order approvals, goods receipts, sales) call it the same
 * way. Deliberately a plain insert outside of whatever transaction the audited action ran in: a
 * rejected action rolls its own transaction back, but the attempt — and its rejection — is still
 * worth auditing, so this call must survive that rollback.
 */
export function recordAudit(prisma: PrismaLike, input: RecordAuditInput): Promise<AuditLog> {
  return prisma.auditLog.create({ data: input });
}
