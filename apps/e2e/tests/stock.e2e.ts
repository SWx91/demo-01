import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD } from './accounts.js';

// Demo (ticket #13): seed opening balances; a movement records before/after balances; a balance
// can never be driven below zero. Driven through the API because this ticket has no UI yet: the
// stock model and its posting mechanism are what the ticket delivers. The test creates its own
// store and product (unique suffixes) so it never depends on another test's rows.
//
// Stock posting is restricted to stock-handling roles, so this walks the line as the seeded
// administrator (signed in through the API, exactly as auth.setup.ts does for admin/staff).
test.describe('stock balances and movements', () => {
  test('opening balance is listable, a movement records before/after, and a balance cannot go below zero', async ({
    request,
  }) => {
    const suffix = `${Date.now()}-${test.info().testId}`;

    const login = await request.post('/api/auth/login', {
      data: { email: 'administrator@erp.local', password: DEMO_PASSWORD },
    });
    expect(login.ok(), `administrator login returned ${login.status()}`).toBeTruthy();

    // Our own store and product for this run.
    const storeRes = await request.post('/api/stores', {
      data: { code: `E2E-${suffix}`, name: 'E2E Stock Store' },
    });
    expect(storeRes.ok(), `create store returned ${storeRes.status()}`).toBeTruthy();
    const store = await storeRes.json();

    const productRes = await request.post('/api/products', {
      data: {
        sku: `E2E-SKU-${suffix}`,
        name: 'E2E Stock Product',
        category: 'Test',
        unit: 'unit',
        sellingPriceMinor: 1000,
      },
    });
    expect(productRes.ok(), `create product returned ${productRes.status()}`).toBeTruthy();
    const product = await productRes.json();

    // Seed an opening balance of 10 through a RECEIPT (the mechanism the seed and every stock
    // change use). The movement records the balance before (0) and after (10).
    const opening = await request.post('/api/stock/movements', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: 10,
        movementType: 'OPENING',
        sourceDocument: `OPEN-${suffix}`,
      },
    });
    expect(opening.ok(), `opening movement returned ${opening.status()}`).toBeTruthy();
    const openingMovement = await opening.json();
    expect(openingMovement.balanceBefore).toBe(0);
    expect(openingMovement.balanceAfter).toBe(10);

    // The opening balance is now listable for the store.
    const balancesRes = await request.get('/api/stock/balances', {
      params: { storeId: store.id },
    });
    expect(balancesRes.ok(), `list balances returned ${balancesRes.status()}`).toBeTruthy();
    const balances: { productId: string; quantity: number }[] = await balancesRes.json();
    expect(balances.find((b) => b.productId === product.id)?.quantity).toBe(10);

    // A SALE of 4 records before (10) and after (6).
    const sale = await request.post('/api/stock/movements', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: -4,
        movementType: 'SALE',
        sourceDocument: `SO-${suffix}`,
      },
    });
    expect(sale.ok(), `sale movement returned ${sale.status()}`).toBeTruthy();
    const saleMovement = await sale.json();
    expect(saleMovement.balanceBefore).toBe(10);
    expect(saleMovement.balanceAfter).toBe(6);

    // A balance can never be driven below zero: withdrawing 7 from 6 is rejected...
    const overdraw = await request.post('/api/stock/movements', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: -7,
        movementType: 'SALE',
        sourceDocument: `SO-OVER-${suffix}`,
      },
    });
    expect(overdraw.ok(), 'driving the balance below zero must be rejected').toBeFalsy();

    // ...and the balance is unchanged at 6.
    const afterRes = await request.get('/api/stock/balances', {
      params: { storeId: store.id },
    });
    const after: { productId: string; quantity: number }[] = await afterRes.json();
    expect(after.find((b) => b.productId === product.id)?.quantity).toBe(6);
  });
});
