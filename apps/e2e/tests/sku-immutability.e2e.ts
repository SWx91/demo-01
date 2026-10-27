import { expect, test } from '@playwright/test';
import { storageState } from './accounts.js';

// Demo (ticket #18): after a movement on a product's SKU, editing its SKU is rejected; editing
// its name still works. The ticket names SKU001, but per write-e2e's isolation rule this test
// creates its own store and product (unique suffixes) through the products screen itself, so it
// never depends on, or races with, another test's rows — the scenario the Demo line describes is
// what matters, not the identity of the seeded SKU001 row.
test.describe('product SKU immutability', () => {
  test.use({ storageState: storageState('administrator') });

  test('after a movement on the product, editing its SKU is rejected; editing its name still works', async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${test.info().testId}`;
    const sku = `E2E-SKU-${suffix}`;

    await page.goto('/products');

    // Create the product through the screen, which also opens its edit form (AC1: before any
    // movement exists, the SKU can still be corrected — proven here by it being an ordinary,
    // enabled field).
    await page.getByLabel('รหัสสินค้า (SKU)').fill(sku);
    await page.getByLabel('ชื่อสินค้า').fill('E2E Immutability Product');
    await page.getByLabel('หมวดหมู่').fill('Test');
    await page.getByLabel('หน่วยนับ').fill('unit');
    await page.getByLabel('ราคาขาย (บาท)').fill('10.00');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('แก้ไขสินค้า')).toBeVisible();

    // Look the product up by its SKU to get its id, so a stock movement can be posted against it.
    const found = await request.get('/api/products', { params: { query: sku } });
    expect(found.ok(), `search for ${sku} returned ${found.status()}`).toBeTruthy();
    const [product] = await found.json();
    expect(product?.sku).toBe(sku);

    const storeRes = await request.post('/api/stores', {
      data: { code: `E2E-${suffix}`, name: 'E2E Immutability Store' },
    });
    expect(storeRes.ok(), `create store returned ${storeRes.status()}`).toBeTruthy();
    const store = await storeRes.json();

    // Now a movement references the product: its SKU freezes (MD-01).
    const movement = await request.post('/api/stock/movements', {
      data: {
        storeId: store.id,
        productId: product.id,
        quantityChange: 1,
        movementType: 'OPENING',
        sourceDocument: `OPEN-${suffix}`,
      },
    });
    expect(movement.ok(), `opening movement returned ${movement.status()}`).toBeTruthy();

    // Editing its SKU is rejected (AC2), with a Thai, actionable error.
    await page.getByLabel('แก้ไขรหัสสินค้า (SKU)').fill(`${sku}-CHANGED`);
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.getByRole('alert')).toContainText('ไม่สามารถเปลี่ยนรหัสสินค้า');

    // Editing its name still works (AC3): put the SKU back, change the name, and save.
    await page.getByLabel('แก้ไขรหัสสินค้า (SKU)').fill(sku);
    await page.getByLabel('แก้ไขชื่อสินค้า').fill('E2E Immutability Product (renamed)');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.getByRole('status')).toContainText('บันทึกสินค้าเรียบร้อยแล้ว');
  });
});
