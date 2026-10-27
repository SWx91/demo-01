import path from 'node:path';

// The two demo accounts from packages/database/prisma/seed.ts. Tests never create users;
// they sign in as one of these through the saved storage state.
export const DEMO_PASSWORD = 'password';

export const accounts = {
  admin: { email: 'admin@erp.local', name: 'Admin User', role: 'ADMIN' },
  staff: { email: 'staff@erp.local', name: 'Staff User', role: 'STAFF' },
  // Distinct from `admin` (role ADMIN): this is the ADMINISTRATOR role the products screen checks
  // (ticket #18), needed for any UI test that creates or edits a product.
  administrator: { email: 'administrator@erp.local', name: 'Administrator', role: 'ADMINISTRATOR' },
} as const;

export type AccountName = keyof typeof accounts;

/** Where auth.setup.ts saves each account's cookies. Gitignored. */
export function storageState(name: AccountName) {
  return path.resolve(import.meta.dirname, '..', '.auth', `${name}.json`);
}
