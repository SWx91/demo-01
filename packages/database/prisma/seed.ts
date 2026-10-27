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
    `Seeded ${stores.length} stores, ${suppliers.length} suppliers and ${demoUsers.length} demo users (password: "${DEMO_PASSWORD}").`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
