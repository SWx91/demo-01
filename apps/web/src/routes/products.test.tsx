import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { ProductEditForm, ProductsPage } from './products';

const administrator = {
  id: '1',
  email: 'administrator@erp.local',
  name: 'Administrator',
  role: 'ADMINISTRATOR',
  store: null,
};

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProductsPage />
    </QueryClientProvider>,
  );
}

function conflict(message: string) {
  return Response.json({ defined: false, code: 'CONFLICT', status: 409, message }, { status: 409 });
}

async function fillForm() {
  fireEvent.change(await screen.findByLabelText('รหัสสินค้า (SKU)'), {
    target: { value: 'SKU001' },
  });
  fireEvent.change(screen.getByLabelText('ชื่อสินค้า'), { target: { value: 'Jasmine Rice 5kg' } });
  fireEvent.change(screen.getByLabelText('หมวดหมู่'), { target: { value: 'Groceries' } });
  fireEvent.change(screen.getByLabelText('หน่วยนับ'), { target: { value: 'bag' } });
  fireEvent.change(screen.getByLabelText('ราคาขาย (บาท)'), { target: { value: '125.00' } });
}

describe('ProductsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a product and confirms success in Thai', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'POST /products': {
        id: 'prod1',
        sku: 'SKU001',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      },
    });

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('status')).toHaveTextContent('บันทึกสินค้าเรียบร้อยแล้ว');
  });

  it('sends the selling price as integer minor units (satang)', async () => {
    const fetch = mockApi({
      'GET /auth/me': { user: administrator },
      'POST /products': {
        id: 'prod1',
        sku: 'SKU001',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      },
    });

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    await screen.findByRole('status');
    const postCall = fetch.mock.calls.find(
      ([request]) => request.method === 'POST' && request.url.endsWith('/api/products'),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(await postCall![0].clone().text());
    expect(body.sellingPriceMinor).toBe(12500);
  });

  it('shows a loading state on the button while the create is pending', async () => {
    // A fetch that never resolves keeps the mutation pending so the loading label stays visible.
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        if (request.url.endsWith('/api/auth/me')) {
          return Promise.resolve(Response.json({ user: administrator }));
        }
        return new Promise(() => {});
      }),
    );

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('button', { name: 'กำลังบันทึก…' })).toBeDisabled();
  });

  it('shows the Thai conflict message when the SKU already exists', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'POST /products': conflict('รหัสสินค้า (SKU) "SKU001" มีอยู่แล้ว'),
    });

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('รหัสสินค้า (SKU) "SKU001" มีอยู่แล้ว');
  });

  it('falls back to a generic Thai error without leaking a stack trace', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'POST /products': Response.json(
        { defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'boom at line 42' },
        { status: 500 },
      ),
    });

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('ไม่สามารถบันทึกสินค้าได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่');
    expect(alert).not.toHaveTextContent('boom at line 42');
  });

  it('rejects a blank price in Thai without calling the API', async () => {
    const fetch = mockApi({ 'GET /auth/me': { user: administrator } });

    renderPage();
    // Fill everything except the price.
    fireEvent.change(await screen.findByLabelText('รหัสสินค้า (SKU)'), {
      target: { value: 'SKU001' },
    });
    fireEvent.change(screen.getByLabelText('ชื่อสินค้า'), {
      target: { value: 'Jasmine Rice 5kg' },
    });
    fireEvent.change(screen.getByLabelText('หมวดหมู่'), { target: { value: 'Groceries' } });
    fireEvent.change(screen.getByLabelText('หน่วยนับ'), { target: { value: 'bag' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกราคาขายให้ถูกต้อง');
    const postCall = fetch.mock.calls.find(([request]) => request.method === 'POST');
    expect(postCall).toBeUndefined();
  });

  it('rejects a non-numeric price in Thai without calling the API', async () => {
    const fetch = mockApi({ 'GET /auth/me': { user: administrator } });

    renderPage();
    await fillForm();
    fireEvent.change(screen.getByLabelText('ราคาขาย (บาท)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกราคาขายให้ถูกต้อง');
    const postCall = fetch.mock.calls.find(([request]) => request.method === 'POST');
    expect(postCall).toBeUndefined();
  });

  it('reveals a reachable edit screen for the product just created', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'POST /products': {
        id: 'prod1',
        sku: 'SKU001',
        name: 'Jasmine Rice 5kg',
        category: 'Groceries',
        unit: 'bag',
        sellingPriceMinor: 12500,
        active: true,
      },
    });

    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    // After a successful create the edit screen appears, prefilled with the new product.
    expect(await screen.findByText('แก้ไขสินค้า')).toBeInTheDocument();
    expect(screen.getByLabelText('ชื่อสินค้า', { selector: '#edit-product-name' })).toHaveValue(
      'Jasmine Rice 5kg',
    );
  });
});

const existingProduct = {
  id: 'prod1',
  sku: 'SKU001',
  name: 'Jasmine Rice 5kg',
  category: 'Groceries',
  unit: 'bag',
  sellingPriceMinor: 12500,
  active: true,
};

function renderEditForm() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProductEditForm product={existingProduct} />
    </QueryClientProvider>,
  );
}

describe('ProductEditForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('edits a product and confirms success in Thai, sending the mutated fields as satang', async () => {
    const fetch = mockApi({
      'PUT /products/prod1': {
        ...existingProduct,
        name: 'Jasmine Rice 10kg',
        sellingPriceMinor: 24000,
      },
    });

    renderEditForm();
    // The form is prefilled with the product's current values.
    expect(screen.getByLabelText('ชื่อสินค้า')).toHaveValue('Jasmine Rice 5kg');
    expect(screen.getByLabelText('ราคาขาย (บาท)')).toHaveValue(125);

    fireEvent.change(screen.getByLabelText('ชื่อสินค้า'), {
      target: { value: 'Jasmine Rice 10kg' },
    });
    fireEvent.change(screen.getByLabelText('ราคาขาย (บาท)'), { target: { value: '240.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('status')).toHaveTextContent('บันทึกสินค้าเรียบร้อยแล้ว');

    const putCall = fetch.mock.calls.find(
      ([request]) => request.method === 'PUT' && request.url.endsWith('/api/products/prod1'),
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(await putCall![0].clone().text());
    expect(body.name).toBe('Jasmine Rice 10kg');
    expect(body.sellingPriceMinor).toBe(24000);
  });

  it('shows a loading state on the button while the edit is pending', async () => {
    // A fetch that never resolves keeps the mutation pending so the loading label stays visible.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderEditForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('button', { name: 'กำลังบันทึก…' })).toBeDisabled();
  });

  it('falls back to a generic Thai error without leaking a stack trace', async () => {
    mockApi({
      'PUT /products/prod1': Response.json(
        { defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'boom at line 42' },
        { status: 500 },
      ),
    });

    renderEditForm();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('ไม่สามารถบันทึกสินค้าได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่');
    expect(alert).not.toHaveTextContent('boom at line 42');
  });
});
