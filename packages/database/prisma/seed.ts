import { createPrismaClient, hashPassword, Role } from '../src/index.js';

const prisma = createPrismaClient(
  process.env.DATABASE_URL ?? 'postgresql://erp:erp@localhost:5432/erp',
);

// Workshop stores (branches). Re-running the seed keeps them stable by code.
const stores = [
  { code: 'B01', name: 'Branch 01' },
  { code: 'B02', name: 'Branch 02' },
];

// Workshop suppliers. Re-running the seed keeps them stable by code.
const suppliers = [
  {
    code: 'SUP01',
    name: 'SupplyOne Co Ltd',
    contactName: 'Somchai Jaidee',
    phone: '02-123-4567',
    email: 'sales@supplyone.co.th',
    address: '123 Sukhumvit Rd, Bangkok 10110',
  },
];

// Workshop catalogue (TOR §8.1). Prices are in satang (integer minor units). Re-running the seed
// keeps them stable by SKU.
const products = [
  {
    sku: 'SKU001',
    name: 'Drinking water pack of 6',
    category: 'Beverages',
    unit: 'pack',
    sellingPriceMinor: 6000,
  },
  {
    sku: 'SKU002',
    name: 'Tissue paper',
    category: 'Household',
    unit: 'pack',
    sellingPriceMinor: 3500,
  },
  {
    sku: 'SKU003',
    name: 'Laundry detergent',
    category: 'Household',
    unit: 'bag',
    sellingPriceMinor: 12000,
  },
];

// Opening stock balances (TOR §8.1): B01 holds 10/5/0 of SKU001/002/003; every B02 balance is zero.
// Keyed on (store code, SKU) so the seed is re-runnable.
const openingBalances: { storeCode: string; sku: string; quantity: number }[] = [
  { storeCode: 'B01', sku: 'SKU001', quantity: 10 },
  { storeCode: 'B01', sku: 'SKU002', quantity: 5 },
  { storeCode: 'B01', sku: 'SKU003', quantity: 0 },
  { storeCode: 'B02', sku: 'SKU001', quantity: 0 },
  { storeCode: 'B02', sku: 'SKU002', quantity: 0 },
  { storeCode: 'B02', sku: 'SKU003', quantity: 0 },
];

// Every product has a reorder threshold of 3 in every store (TOR §8.1).
const REORDER_THRESHOLD = 3;

// Demo accounts for the workshop (also shown on the login page). Re-running the seed resets them.
// Store employees are bound to a store; everyone else is unassigned. Store scope is derived
// from this assignment, never from request input.
const demoUsers: {
  email: string;
  name: string;
  role: Role;
  storeCode?: string;
}[] = [
  { email: 'admin@erp.local', name: 'Admin User', role: Role.ADMIN },
  { email: 'staff@erp.local', name: 'Staff User', role: Role.STAFF },
  { email: 'administrator@erp.local', name: 'Administrator', role: Role.ADMINISTRATOR },
  { email: 'buyer01@erp.local', name: 'Purchasing Officer', role: Role.PURCHASING_OFFICER },
  {
    email: 'staff_b01@erp.local',
    name: 'Store Employee B01',
    role: Role.STORE_EMPLOYEE,
    storeCode: 'B01',
  },
  {
    email: 'staff_b02@erp.local',
    name: 'Store Employee B02',
    role: Role.STORE_EMPLOYEE,
    storeCode: 'B02',
  },
  { email: 'manager01@erp.local', name: 'Manager', role: Role.MANAGER },
];
const DEMO_PASSWORD = 'password';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const storesByCode = new Map<string, string>();
  for (const store of stores) {
    const saved = await prisma.store.upsert({
      where: { code: store.code },
      update: { name: store.name },
      create: store,
    });
    storesByCode.set(saved.code, saved.id);
  }

  for (const supplier of suppliers) {
    const { code, ...rest } = supplier;
    await prisma.supplier.upsert({
      where: { code },
      update: rest,
      create: supplier,
    });
  }

  // Catalogue, keyed on SKU. Collect ids so opening balances can attach to the right product.
  const productsBySku = new Map<string, string>();
  for (const product of products) {
    const saved = await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        category: product.category,
        unit: product.unit,
        sellingPriceMinor: product.sellingPriceMinor,
      },
      create: product,
    });
    productsBySku.set(saved.sku, saved.id);
  }

  // Store-scoped rows (reorder threshold) and opening balances. A balance exists per product per
  // store; the opening balance is the baseline every later movement builds on (US-14).
  for (const { storeCode, sku, quantity } of openingBalances) {
    const storeId = storesByCode.get(storeCode);
    const productId = productsBySku.get(sku);
    if (!storeId || !productId) continue;

    await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: { reorderThreshold: REORDER_THRESHOLD },
      create: { storeId, productId, reorderThreshold: REORDER_THRESHOLD },
    });
    // Only set the opening balance when the row is first created. Re-running the seed must never
    // clobber a live balance that stock movements have since changed (US-14: balance = opening +
    // successful movements). An empty `update` leaves an existing balance exactly as it is.
    await prisma.stockBalance.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: {},
      create: { storeId, productId, quantity },
    });
  }

  for (const user of demoUsers) {
    const storeId = user.storeCode ? (storesByCode.get(user.storeCode) ?? null) : null;
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash, storeId },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        storeId,
      },
    });
  }
  console.log(
    `Seeded ${stores.length} stores, ${suppliers.length} suppliers, ${products.length} products, ` +
      `${openingBalances.length} opening balances and ${demoUsers.length} demo users ` +
      `(password: "${DEMO_PASSWORD}").`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
