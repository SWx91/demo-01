import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { SuppliersPage } from './suppliers';

const administrator = {
  id: '1',
  email: 'administrator@erp.local',
  name: 'Administrator',
  role: 'ADMINISTRATOR',
  store: null,
};

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SuppliersPage />
    </QueryClientProvider>,
  );
}

function supplierPage(items: SupplierRow[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function conflict(message: string) {
  return Response.json({ defined: false, code: 'CONFLICT', status: 409, message }, { status: 409 });
}

async function addSupplier(code: string, name: string) {
  fireEvent.change(await screen.findByLabelText('รหัสผู้จัดจำหน่าย'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('ชื่อผู้จัดจำหน่าย'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
}

describe('SuppliersPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a loading state while the list is pending', () => {
    mockApi({ 'GET /auth/me': { user: administrator } });

    renderPage();

    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
  });

  it('renders suppliers newest-first as the API returns them', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /suppliers': supplierPage([
        { id: 'sup2', code: 'SUP02', name: 'Second Co' },
        { id: 'sup1', code: 'SUP01', name: 'SupplyOne Co Ltd' },
      ]),
    });

    renderPage();

    expect(await screen.findByText('Second Co')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Header row first, then SUP02 (newest) before SUP01.
    expect(rows[1]).toHaveTextContent('SUP02');
    expect(rows[2]).toHaveTextContent('SUP01');
  });

  it('shows a Thai, actionable error without a stack trace when the list fails', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /suppliers': Response.json(
        { defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'boom at line 42' },
        { status: 500 },
      ),
    });

    renderPage();

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('ไม่สามารถโหลดรายการผู้จัดจำหน่ายได้ กรุณาลองใหม่อีกครั้ง');
    expect(alert).not.toHaveTextContent('boom at line 42');
  });

  it('confirms success in Thai after an administrator adds a supplier', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /suppliers': supplierPage([]),
      'POST /suppliers': { id: 'sup1', code: 'SUP01', name: 'SupplyOne Co Ltd' },
    });

    renderPage();
    await addSupplier('SUP01', 'SupplyOne Co Ltd');

    expect(await screen.findByRole('status')).toHaveTextContent('บันทึกผู้จัดจำหน่ายเรียบร้อยแล้ว');
  });

  it('shows the Thai conflict message when the supplier code already exists', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /suppliers': supplierPage([]),
      'POST /suppliers': conflict('รหัสผู้จัดจำหน่าย "SUP01" มีอยู่แล้ว'),
    });

    renderPage();
    await addSupplier('SUP01', 'SupplyOne Co Ltd');

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('รหัสผู้จัดจำหน่าย "SUP01" มีอยู่แล้ว');
  });
});
