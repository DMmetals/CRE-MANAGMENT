import { MemoryRouter } from 'react-router-dom';
// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EnquiryCRM } from './EnquiryCRM';
import type { EnquiryMaterial } from '@cre/shared';
vi.mock('./api', () => ({
  loadConfig: async () => ({ canCreate: true, date: '2026-10-07' }),
  loadRegister: async () => ({
    type: 'CRR',
    fetchedAt: new Date().toISOString(),
    rows: [
      {
        id: 'one',
        rowNumber: 8,
        enquiryNo: 'C/1/26-27',
        customer: 'Test customer',
        salesPerson: 'Test salesperson',
        branch: 'Faridabad',
        sku: '1-1250-2500-2B-304',
        qty: 10,
        status: 'Won',
        date: '2026-10-07',
        poNumber: 'PO-1',
        remarks: 'Confirmed',
        quoteUrl: null,
      } as EnquiryMaterial,
    ],
  }),
  saveEnquiry: vi.fn(),
  request: vi.fn(async (url: string) =>
    url.startsWith('/api/customers/')
      ? ['Test customer']
      : url.startsWith('/api/meta/sales-persons/')
        ? { options: ['Test salesperson'], source: 'centralized-fallback' }
        : url === '/api/enquiries-config'
          ? { writesEnabled: false }
          : { enquiryNo: 'C/2/26-27', date: '2026-10-07' },
  ),
}));
afterEach(cleanup);
describe('CRM register', () => {
  it('loads real API-shaped records and opens enquiry details', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EnquiryCRM type="CRR" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('C/1/26-27');
    expect(
      screen.getByRole('button', { name: 'Transfer to O2D FBD' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText('C/1/26-27'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Materials (1)')).toBeTruthy();
  });
  it('filters records and opens the multi-material enquiry form', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EnquiryCRM type="CRR" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('Test customer');
    fireEvent.change(screen.getByLabelText('Search enquiries'), {
      target: { value: 'no match' },
    });
    expect(screen.getByText('No enquiries match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByText('Add enquiry'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    fireEvent.click(screen.getByText('Add material'));
    expect(screen.getByText('Material 2')).toBeTruthy();
  });
});
