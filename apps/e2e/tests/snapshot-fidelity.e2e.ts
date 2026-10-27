import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD } from './accounts.js';

// Demo (ticket #19): change SKU001's selling price; an existing movement still shows the details
// recorded at the time. Driven through the API, exactly like stock.e2e.ts (ticket #13) and
// stock-adjustment.e2e.ts (ticket #17): this ticket has no history UI yet. The test creates its
// own store and product (unique suffixes) rather than the seeded SKU001 row, per write-e2e's
// isolation rule — the scenario the Demo line describes is what matters, not SKU001's identity.
test.describe('historical snapshot fidelity', () => {
  test("changing a product's selling price leaves an existing movement showing the details recorded at the time", async ({
    request,
  }) => {
    const suffix = `${Date.now()}-${test.info().testId}`;

    const adminLogin = await request.post('/api/auth/login', {
      data: { email: 'administrator@erp.local', password: DEMO_PASSWORD },
    });
    expect(adminLogin.ok(), `administrator login returned ${adminLogin.status()}`).toBeTruthy();

    const storeRes = await request.post('/api/stores', {
      data: { code: `E2E-${suffix}`, name: 'E2E Snapshot Store' },
    });
    expect(storeRes.ok(), `create store returned ${storeRes.status()}`).toBeTruthy();
    const store = await storeRes.json();

    const productRes = await request.post('/api/products', {
      data: {
        sku: `E2E-SKU-${suffix}`,
        name: 'E2E Snapshot Product',
        category: 'Test',
        unit: 'unit',
        sellingPriceMinor: 10000,
      },
    });
    expect(productRes.ok(), `create product returned ${productRes.status()}`).toBeTruthy();
    const product = await productRes.json();

    // An opening movement records the product's name and price as they are right now.
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
    expect(openingMovement.productNameSnapshot).toBe('E2E Snapshot Product');
    expect(openingMovement.sellingPriceMinorSnapshot).toBe(10000);

    // Now change SKU001's selling price (the Demo line) and its name, through the same edit route
    // ticket #18 proved SKU immutability on.
    const update = await request.put(`/api/products/${product.id}`, {
      data: {
        id: product.id,
        sku: product.sku,
        name: 'E2E Snapshot Product (renamed)',
        category: product.category,
        unit: product.unit,
        sellingPriceMinor: 25000,
        active: product.active,
      },
    });
    expect(update.ok(), `update product returned ${update.status()}`).toBeTruthy();

    // A historical search of the product still shows the original recorded details on the
    // existing movement — unaffected by the edit just made.
    const history = await request.get('/api/stock/movements', {
      params: { storeId: store.id, productId: product.id },
    });
    expect(history.ok(), `list movements returned ${history.status()}`).toBeTruthy();
    const movements = await history.json();
    expect(movements).toHaveLength(1);
    expect(movements[0].productNameSnapshot).toBe('E2E Snapshot Product');
    expect(movements[0].sellingPriceMinorSnapshot).toBe(10000);
  });
});
