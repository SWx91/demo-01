import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD } from './accounts.js';

// Demo (ticket #17): manager01 increases SKU002 by 5 with a reason; a reduction below zero is
// rejected. Driven through the API because this ticket has no UI yet, exactly like stock.e2e.ts
// (ticket #13). The test creates its own store and product (unique suffixes) rather than the
// seeded B01/SKU002 rows, so it never depends on, or races with, another test's data — the
// manager01 account and the shape of the scenario are what the Demo line names, the row identity
// is not.
test.describe('manager stock adjustment', () => {
  test('manager01 increases a product by 5 with a reason; a reduction below zero is rejected', async ({
    request,
  }) => {
    const suffix = `${Date.now()}-${test.info().testId}`;

    // Store and product creation are Administrator-only, so set up the fixtures signed in as the
    // administrator first.
    const adminLogin = await request.post('/api/auth/login', {
      data: { email: 'administrator@erp.local', password: DEMO_PASSWORD },
    });
    expect(adminLogin.ok(), `administrator login returned ${adminLogin.status()}`).toBeTruthy();

    const storeRes = await request.post('/api/stores', {
      data: { code: `E2E-${suffix}`, name: 'E2E Adjustment Store' },
    });
    expect(storeRes.ok(), `create store returned ${storeRes.status()}`).toBeTruthy();
    const store = await storeRes.json();

    const productRes = await request.post('/api/products', {
      data: {
        sku: `E2E-SKU-${suffix}`,
        name: 'E2E Adjustment Product',
        category: 'Test',
        unit: 'unit',
        sellingPriceMinor: 1000,
      },
    });
    expect(productRes.ok(), `create product returned ${productRes.status()}`).toBeTruthy();
    const product = await productRes.json();

    const opening = await request.post('/api/stock/movements', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: 5,
        movementType: 'OPENING',
        sourceDocument: `OPEN-${suffix}`,
      },
    });
    expect(opening.ok(), `opening movement returned ${opening.status()}`).toBeTruthy();

    // Now sign in as the manager who performs the adjustment the Demo line names.
    const managerLogin = await request.post('/api/auth/login', {
      data: { email: 'manager01@erp.local', password: DEMO_PASSWORD },
    });
    expect(managerLogin.ok(), `manager login returned ${managerLogin.status()}`).toBeTruthy();

    // manager01 increases the product by 5 with a reason: the opening balance of 5 becomes 10.
    const increase = await request.post('/api/stock/adjustments', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: 5,
        reason: `Stock count found a surplus (${suffix})`,
      },
    });
    expect(increase.ok(), `increase adjustment returned ${increase.status()}`).toBeTruthy();
    const increaseMovement = await increase.json();
    expect(increaseMovement.movementType).toBe('ADJUSTMENT');
    expect(increaseMovement.balanceBefore).toBe(5);
    expect(increaseMovement.balanceAfter).toBe(10);

    const balancesRes = await request.get('/api/stock/balances', {
      params: { storeId: store.id },
    });
    const balances: { productId: string; quantity: number }[] = await balancesRes.json();
    expect(balances.find((b) => b.productId === product.id)?.quantity).toBe(10);

    // A reduction greater than the available balance (10) is rejected with a 409 Conflict, and
    // the balance is unchanged (INV-05).
    const overReduce = await request.post('/api/stock/adjustments', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: -11,
        reason: `Stock count found a shortfall (${suffix})`,
      },
    });
    expect(overReduce.status(), 'reducing below zero must be a 409 Conflict').toBe(409);

    const afterRes = await request.get('/api/stock/balances', {
      params: { storeId: store.id },
    });
    const after: { productId: string; quantity: number }[] = await afterRes.json();
    expect(after.find((b) => b.productId === product.id)?.quantity).toBe(10);
  });

  test('a non-manager cannot call the adjustment route directly', async ({ request }) => {
    const suffix = `${Date.now()}-${test.info().testId}`;

    const adminLogin = await request.post('/api/auth/login', {
      data: { email: 'administrator@erp.local', password: DEMO_PASSWORD },
    });
    expect(adminLogin.ok(), `administrator login returned ${adminLogin.status()}`).toBeTruthy();

    const storeRes = await request.post('/api/stores', {
      data: { code: `E2E-${suffix}`, name: 'E2E Adjustment Guard Store' },
    });
    const store = await storeRes.json();
    const productRes = await request.post('/api/products', {
      data: {
        sku: `E2E-SKU-G-${suffix}`,
        name: 'E2E Adjustment Guard Product',
        category: 'Test',
        unit: 'unit',
        sellingPriceMinor: 1000,
      },
    });
    const product = await productRes.json();

    // The administrator who set up the fixtures is still signed in, and is not a Manager.
    const rejected = await request.post('/api/stock/adjustments', {
      data: { storeId: store.id, productId: product.id, quantityChange: 5, reason: 'test' },
    });
    expect(rejected.status(), 'a non-manager must be refused with a 403 Forbidden').toBe(403);
  });
});
