import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';
export { hashPassword, verifyPassword } from './password.js';
export { postStockMovement } from './stock.js';
export type { PostStockMovementInput } from './stock.js';
export { recordAudit } from './audit.js';
export type { RecordAuditInput } from './audit.js';

/** Prisma 7 talks to Postgres through a driver adapter (node-postgres). */
export function createPrismaAdapter(connectionString: string) {
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: createPrismaAdapter(connectionString) });
}
