import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { StoresPage } from './stores-page';

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
      <StoresPage />
    </QueryClientProvider>,
  );
}

function storePage(items: { id: string; code: string; name: string }[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

describe('StoresPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a loading state while the list is pending', () => {
    mockApi({ 'GET /auth/me': { user: administrator } });

    renderPage();

    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
  });

  it('renders stores newest-first as the API returns them', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /stores': storePage([
        { id: 's2', code: 'B02', name: 'Riverside Store' },
        { id: 's1', code: 'B01', name: 'Central Store' },
      ]),
    });

    renderPage();

    expect(await screen.findByText('Riverside Store')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Header row first, then B02 (newest) before B01.
    expect(rows[1]).toHaveTextContent('B02');
    expect(rows[2]).toHaveTextContent('B01');
  });

  it('shows a Thai, actionable error without a stack trace when the list fails', async () => {
    mockApi({
      'GET /auth/me': { user: administrator },
      'GET /stores': Response.json(
        { defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'boom at line 42' },
        { status: 500 },
      ),
    });

    renderPage();

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('ไม่สามารถโหลดรายการสาขาได้ กรุณาลองใหม่อีกครั้ง');
    expect(alert).not.toHaveTextContent('boom at line 42');
  });
});
