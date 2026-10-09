// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { EnquiryMaterial, O2DData, O2DField, O2DRow } from '@cre/shared';
import { TransferToO2D } from './TransferToO2D';
import { O2DPage } from './O2DPage';
const request = vi.hoisted(() => vi.fn());
vi.mock('../enquiries/api', () => ({ request }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  request.mockReset();
});
function show(node: React.ReactNode, url = '/o2d/fbd') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
function material(patch: Partial<EnquiryMaterial> = {}): EnquiryMaterial {
  return {
    id: 'source-1',
    rowNumber: 8,
    enquiryNo: 'C/245/26-27',
    customer: 'Test customer',
    salesPerson: 'Test sales',
    branch: 'FBD',
    status: 'Won',
    poNumber: 'PO-1',
    remarks: 'Confirmed',
    sku: '1-1250-2500-2B-304',
    ...patch,
  } as EnquiryMaterial;
}
function field(
  header: string,
  column: number,
  patch: Partial<O2DField> = {},
): O2DField {
  return {
    column,
    letter: String.fromCharCode(64 + column),
    header,
    occurrence: 1,
    section: 'Order',
    meaning: header,
    value: '',
    protected: false,
    editable: true,
    ...patch,
  };
}
function row(patch: Partial<O2DRow> = {}): O2DRow {
  return {
    id: 'fbd-row-8',
    version: 'v1',
    rowNumber: 8,
    enquiryNo: 'C/245/26-27',
    srNo: '1',
    customer: 'Test customer',
    category: 'CRR',
    salesPerson: 'Sales',
    sku: 'SKU-A',
    poNumber: 'PO-1',
    poDate: '',
    thickness: '1',
    width: '1250',
    length: '2500',
    finish: '2B',
    grade: '304',
    edge: 'ME',
    nos: null,
    qty: 10,
    balance: 8,
    rate: 200,
    totalValue: null,
    limit: '',
    paymentTerms: '',
    receivingDate: '',
    termsCondition: '',
    sizeRateApproval: '',
    materialStatus: '',
    lotNo: '',
    crdd: '',
    approval: '',
    statusD: '',
    statusG: '',
    purchaseTargetDate: '',
    jindalExpectedDate: '',
    jobWorkExpectedDate: '',
    revisedCrdd: '',
    statusPr: '',
    dispatchLink: null,
    vehicleNumber: '',
    transporter: '',
    remarks: '',
    status: '',
    processStatus: '',
    finalStatusTimestamp: '',
    moveStatus: '',
    fields: [
      field('Nos', 15, { value: '' }),
      field('Balance Qty', 17, {
        value: '8',
        protected: true,
        editable: false,
      }),
    ],
    protectedFields: ['Balance Qty'],
    invoiceHistory: [],
    ...patch,
  };
}
function data(rows: O2DRow[] = []): O2DData {
  return {
    branch: 'FBD',
    rows,
    fetchedAt: '',
    identityVerified: true,
    warning: null,
    kpis: {
      totalOrders: new Set(rows.map((r) => r.enquiryNo)).size,
      totalMaterials: rows.length,
      totalOrderQty: 20,
      totalBalanceQty: 16,
    },
  };
}
const preview = {
  destination: 'FBD',
  enquiryNo: 'C/245/26-27',
  spreadsheetId: 'sheet',
  sheetName: 'FMS',
  transferred: 1,
  skippedDuplicates: 0,
  srNos: [1],
  rowsToInsert: [
    {
      srNo: 1,
      sourceId: 'source-1',
      fields: {
        'Enquiry No.': 'C/245/26-27',
        Category: 'CRR',
        'Order Rate': 200,
      },
    },
  ],
  protectedFields: [],
  previewToken: 'reviewed-source-version',
};
describe('Won to O2D transfer', () => {
  it('hides transfer for non-Won materials and explains missing PO and remarks', async () => {
    request.mockResolvedValue(data());
    const rendered = show(
      <TransferToO2D type="CRR" rows={[material({ status: 'Loss' })]} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Transfer to O2D FBD' }),
    ).toBeNull();
    rendered.unmount();
    show(
      <TransferToO2D
        type="CRR"
        rows={[material({ poNumber: '', remarks: '' })]}
      />,
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Transfer to O2D FBD',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText('PO Number is required before transferring to O2D.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Remarks are required before transferring to O2D.'),
    ).toBeTruthy();
  });
  it('previews first, sends the confirmed token and links by enquiry after transfer', async () => {
    request.mockImplementation(async (path: string) =>
      path.includes('/transfer') ? preview : data(),
    );
    show(
      <TransferToO2D
        type="CRR"
        rows={[material(), material({ id: 'lost', status: 'Loss' })]}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Transfer to O2D FBD' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('PO-1')).toBeTruthy();
    expect(within(dialog).queryByText('Order No')).toBeNull();
    expect(
      request.mock.calls.some(([path]) => path === '/api/o2d/transfer'),
    ).toBe(false);
    expect(
      JSON.parse(
        request.mock.calls.find(
          ([path]) => path === '/api/o2d/transfer/preview',
        )![1].body,
      ),
    ).toEqual({ type: 'CRR', enquiryNo: 'C/245/26-27', branch: 'FBD' });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Transfer$/ }));
    const link = await screen.findByRole('link', { name: 'Open O2D FBD' });
    expect(link.getAttribute('href')).toBe('/o2d/fbd?enquiry=C%2F245%2F26-27');
    expect(
      JSON.parse(
        request.mock.calls.find(([path]) => path === '/api/o2d/transfer')![1]
          .body,
      ),
    ).toEqual({
      type: 'CRR',
      enquiryNo: 'C/245/26-27',
      branch: 'FBD',
      previewToken: preview.previewToken,
    });
  });
  it('offers normalized branch actions without letting incomplete Won rows block eligible ones', async () => {
    request.mockImplementation(async (path: string) =>
      path.includes('/transfer') ? preview : data(),
    );
    show(
      <TransferToO2D
        compact
        type="CRR"
        rows={[
          material({ branch: 'Faridabad', orderQty: null }),
          material({ id: 'incomplete', branch: 'Trade(FBD)', poNumber: '' }),
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Transfer to O2D FBD' }),
    );
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(
      request.mock.calls.some(([path]) => path === '/api/o2d/transfer/preview'),
    ).toBe(true);
  });
  it('explains disabled writes and prevents confirming a read-only preview', async () => {
    request.mockImplementation(async (path: string) =>
      path.includes('/transfer')
        ? { ...preview, writesEnabled: false }
        : data(),
    );
    show(<TransferToO2D type="CRR" rows={[material()]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Transfer to O2D FBD' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Sheet writes are disabled',
    );
    expect(
      (
        within(dialog).getByRole('button', {
          name: /^Transfer$/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it('cancels the preview without writing and restores previous transfers on load', async () => {
    request.mockImplementation(async (path: string) =>
      path.includes('/transfer/preview') ? preview : data([row()]),
    );
    show(<TransferToO2D type="CRR" rows={[material()]} />);
    expect(
      await screen.findByText('O2D status: Transferred to O2D FBD'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Transfer to O2D FBD' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      request.mock.calls.some(([path]) => path === '/api/o2d/transfer'),
    ).toBe(false);
  });
});
describe('O2D register', () => {
  it('loads an empty real register without inventing materials', async () => {
    request.mockResolvedValue(data());
    show(<O2DPage branch="FBD" />);
    expect(
      await screen.findByText(
        'No materials transferred yet. Open a Won enquiry and select Transfer to O2D.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('counts unique enquiries, filters by the deep link and searches invoice history', async () => {
    request.mockResolvedValue(
      data([
        row(),
        row({
          id: 'two',
          srNo: '2',
          sku: 'SKU-B',
          invoiceHistory: [
            {
              occurrence: 1,
              invoiceNo: 'INV-203',
              plannedDispatchDate: '',
              qtyDispatched: 2,
              dispatchDate: '',
              invoiceDate: '',
              invoiceValue: 400,
              invoiceDueDate: '',
              fields: [],
            },
          ],
        }),
        row({ id: 'other', enquiryNo: 'N/88/26-27', sku: 'SKU-C' }),
      ]),
    );
    show(<O2DPage branch="FBD" />, '/o2d/fbd?enquiry=C%2F245%2F26-27');
    await screen.findByText('SKU-A');
    expect(screen.queryByText('SKU-C')).toBeNull();
    expect(
      screen.getByText('Total orders').parentElement?.querySelector('strong')
        ?.textContent,
    ).toBe('2');
    expect(
      screen
        .getAllByRole('columnheader')
        .slice(0, 2)
        .map((h) => h.textContent),
    ).toEqual(['Sr no', 'Enquiry No.']);
    expect(screen.queryByText('Order No')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search O2D'), {
      target: { value: 'INV-203' },
    });
    expect(screen.queryByText('SKU-A')).toBeNull();
    expect(screen.getByText('SKU-B')).toBeTruthy();
  });
  it('keeps formulas read only and saves changes with enquiry, serial and version identity', async () => {
    request.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? { updatedRows: 1, protectedFields: [] }
        : data([row()]),
    );
    show(<O2DPage branch="FBD" />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open C/245/26-27 material 1',
      }),
    );
    expect(
      (screen.getByLabelText('Order: Balance Qty') as HTMLInputElement)
        .readOnly,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Order: Nos'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => init?.method === 'PATCH'),
      ).toBe(true),
    );
    const [path, init] = request.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    )!;
    expect(path).toBe('/api/o2d/fbd/rows/fbd-row-8');
    expect(JSON.parse(init.body)).toEqual({
      version: 'v1',
      enquiryNo: 'C/245/26-27',
      srNo: '1',
      changes: [{ column: 15, value: '2' }],
    });
  });
});
