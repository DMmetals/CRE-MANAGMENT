// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DispatchPage } from './DispatchPage';
import type { DispatchPreview, DispatchMaterials } from '@cre/shared';
const request = vi.hoisted(() => vi.fn());
vi.mock('../enquiries/api', () => ({ request }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  request.mockReset();
});
const doc = {
  branch: 'FBD',
  enquiryNo: 'C/1/26-27',
  selectedSrNos: ['1'],
  customer: 'Example',
  companyName: 'D.M. Metalloys Pvt. Ltd.',
  companyHO: 'Head office',
  companyContact: 'Contact',
  batch: 'FARIDABAD',
  companyGSTIN: 'GST-FBD',
  dispatchFromAddress: 'FBD address',
  bankDetails: 'Account name',
  bankName: 'Bank',
  accountNo: '123',
  branchName: 'Bank branch',
  date: '2026-10-09',
  termsOfPayment: 'Advance',
  poRefNo: 'PO/1',
  termsOfDelivery: 'Destination',
  deliveryLocation: '',
  shipToName: 'Example',
  shipToAddress: 'Shipping master address',
  shipGSTIN: 'SHIP-GST',
  billToName: 'Example',
  billToAddress: 'Billing master address',
  billGSTIN: 'BILL-GST',
  vehicleNumber: '',
  transporterName: '',
  transporterGST: '',
  lines: [
    {
      srNo: '1',
      sku: 'SKU1',
      lotNo: 'LOT1',
      grade: '304',
      mt: 'Sheet',
      finish: '2B',
      thk: '1.2',
      wid: '1250',
      lgt: '2500',
      nos: '10',
      qty: '100',
      unitPrice: '120',
      totalPrice: '12000',
    },
  ],
  otherCharges: '0',
  pkgLoading: '0',
  gstRate: '18',
  totalQty: '100',
  goodsTotal: '12000',
  taxableTotal: '12000',
  gstAmount: '2160',
  grandTotal: '14160',
  termsText: 'Terms',
  footerText: 'Footer',
  sourceVersions: { '1': 'v1' },
  warnings: [],
} as DispatchPreview['document'];
const preview: DispatchPreview = {
  document: doc,
  fingerprint: 'fingerprint',
  html: '<h1>Dispatch Order</h1>',
  filename: 'dispatch.pdf',
};
const materials: DispatchMaterials = {
  rows: [
    {
      srNo: '1',
      sku: 'SKU1',
      customer: 'Example',
      approved: true,
      approval: 'Approved',
      version: 'v1',
    },
    {
      srNo: '2',
      sku: 'SKU2',
      customer: 'Example',
      approved: false,
      approval: 'Hold',
      version: 'v2',
    },
  ],
  transporters: [{ name: 'Truck A', gstin: 'TRUCK-GST' }],
  warnings: [],
  company: doc,
  emailReady: true,
  writesEnabled: true,
  emailTo: 'buyer@example.test',
};
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={['/dispatch/fbd?enquiry=C%2F1%2F26-27&sr=1']}
      >
        <DispatchPage branch="FBD" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function mock() {
  request.mockImplementation(async (url: string) => {
    if (url.endsWith('/materials')) return materials;
    if (url.endsWith('/enquiries')) return { enquiries: ['C/1/26-27'] };
    if (url.endsWith('/save'))
      return {
        id: 'saved',
        url: 'https://drive.google.com/file/d/saved/view',
        filename: 'dispatch.pdf',
        updatedRows: 1,
      };
    return preview;
  });
}
describe('Dispatch Order builder', () => {
  it('prefills parties, renders full document fields, preserves approval and preselection', async () => {
    mock();
    show();
    await screen.findByDisplayValue('Billing master address');
    expect(screen.getByDisplayValue('Shipping master address')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: /Sr 1/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: /Sr 2/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    for (const title of [
      'Company',
      'Order details',
      'Bank details',
      'Transport',
      'Materials',
      'Summary',
      'Email',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Transporter Name'), {
      target: { value: 'Truck A' },
    });
    expect(
      (screen.getByLabelText('Transporter GSTIN') as HTMLInputElement).value,
    ).toBe('TRUCK-GST');
    expect(
      (
        screen.getByRole('button', {
          name: 'Save Dispatch Order',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Save Dispatch Order',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
  it('can deselect the initial Sr and saves only selected serials plus draft overrides', async () => {
    mock();
    show();
    await screen.findByDisplayValue('Billing master address');
    const checkbox = screen.getByRole('checkbox', { name: /Sr 1/ });
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    await screen.findByRole('button', { name: 'Save Dispatch Order' });
    fireEvent.change(screen.getByLabelText('Vehicle Number'), {
      target: { value: 'RJ40GA3980' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Save Dispatch Order',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Dispatch Order' }),
    );
    await screen.findByRole('link', { name: 'Open PDF' });
    const call = request.mock.calls.find((c) => c[0].endsWith('/save'));
    expect(JSON.parse(call![1].body)).toMatchObject({
      enquiryNo: 'C/1/26-27',
      srNos: ['1'],
      versions: { '1': 'v1' },
      overrides: { vehicleNumber: 'RJ40GA3980' },
      fingerprint: 'fingerprint',
    });
  });
  it('shows real action errors without a fake success link', async () => {
    mock();
    const fn = request.getMockImplementation()!;
    request.mockImplementation(async (url, ...args) => {
      if (String(url).endsWith('/save'))
        throw new Error('A selected link is protected.');
      return fn(url, ...args);
    });
    show();
    await screen.findByDisplayValue('Billing master address');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Save Dispatch Order',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Dispatch Order' }),
    );
    await screen.findByText('A selected link is protected.');
    expect(screen.queryByRole('link', { name: 'Open PDF' })).toBeNull();
  });
});
