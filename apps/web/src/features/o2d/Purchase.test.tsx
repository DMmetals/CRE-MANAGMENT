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
import { O2DDetail } from './O2DDetail';
import { stepsFixture } from '../../../../api/src/modules/o2d/steps-fixture';
import { mapO2DRows } from '../../../../api/src/modules/o2d/repository';
const request = vi.hoisted(() => vi.fn());
vi.mock('../enquiries/api', () => ({ request }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  request.mockReset();
});
function fixture(branch: 'FBD' | 'MUM' = 'FBD') {
  const data = stepsFixture(branch);
  data.snapshot.values[7]![48] = '08/10/2026';
  data.snapshot.formulas[7]![48] = '46303';
  data.snapshot.values[7]![58] =
    'https://drive.google.com/file/d/sr2-only/view';
  data.snapshot.formulas[7]![58] = data.snapshot.values[7]![58]!;
  data.snapshot.rows = mapO2DRows(data.snapshot);
  const row = data.snapshot.rows[1]!,
    meta = () => ({
      stepLayout: data.layoutFor(8),
      row: data.snapshot.rows[1],
    });
  const server = async (
    path: string,
    options?: { method?: string; body?: string },
  ) => {
    if (path.includes('/meta')) return meta();
    if (path.includes('/enquiries/')) return { rows: data.snapshot.rows };
    if (options?.method === 'PATCH') {
      for (const c of JSON.parse(options.body!).changes) {
        data.snapshot.values[7]![c.column - 1] = c.value;
        data.snapshot.formulas[7]![c.column - 1] = c.value;
      }
      data.snapshot.rows = mapO2DRows(data.snapshot);
      return { updatedRows: 1, protectedFields: [] };
    }
    return [];
  };
  request.mockImplementation(server);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <O2DDetail
        row={row}
        branch={branch}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { ...data, row, meta, server, onSaved };
}
async function tab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
  await screen.findByRole('region', {
    name:
      name === 'Purchase'
        ? /STEP 7 /i
        : name === 'Dispatch'
          ? /STEP 9 /i
          : /STEP 4 /i,
  });
}
describe('Sheet-driven Purchase and Dispatch tabs', () => {
  it.each(['FBD', 'MUM'] as const)(
    'places dates/approval in Purchase and dispatch/final status in Dispatch for %s',
    async (branch) => {
      fixture(branch);
      await tab('Purchase');
      expect(
        screen
          .getAllByRole('region')
          .map((r) => r.getAttribute('aria-labelledby')),
      ).toEqual(['o2d-step-7', 'o2d-step-8']);
      const dates = within(screen.getByRole('region', { name: /STEP 7 /i }));
      for (const label of [
        'Purchase Target Date',
        'Jindal Expected Date',
        'Job Work Expected Date',
        'REVISED CRDD',
      ])
        expect(dates.getByLabelText(label).getAttribute('type')).toBe('date');
      const approval = within(screen.getByRole('region', { name: /STEP 8 /i }));
      expect(
        (approval.getByLabelText('Planned') as HTMLInputElement).readOnly,
      ).toBe(true);
      expect(
        (approval.getByLabelText('Actual') as HTMLInputElement).readOnly,
      ).toBe(true);
      expect(approval.getByRole('combobox', { name: 'Status' })).toBeTruthy();
      expect(screen.queryByLabelText('Vehicle Number')).toBeNull();
      await tab('Dispatch');
      expect(
        screen
          .getAllByRole('region')
          .map((r) => r.getAttribute('aria-labelledby')),
      ).toEqual([
        'o2d-step-9',
        branch === 'FBD' ? 'o2d-step-10' : 'o2d-step-6',
        'o2d-final-status',
      ]);
      const order = within(screen.getByRole('region', { name: /STEP 9 /i }));
      expect(
        order
          .getByRole('link', { name: 'Open Dispatch Order' })
          .getAttribute('href'),
      ).toBe('https://drive.google.com/file/d/sr2-only/view');
      expect(
        order
          .getByRole('link', { name: 'Create Dispatch Order' })
          .getAttribute('href'),
      ).toBe(`/dispatch/${branch.toLowerCase()}?enquiry=C%2F1%2F26-27&sr=2`);
      expect(screen.getByLabelText('Remarks / Challenges').tagName).toBe(
        'INPUT',
      );
      expect(
        screen.getByRole('combobox', { name: 'Final Order Status' }),
      ).toBeTruthy();
      expect(screen.getByLabelText('Final Status Timestamp')).toBeTruthy();
      expect(screen.getByLabelText('Move Status')).toBeTruthy();
      expect(screen.queryByText('Column BM')).toBeNull();
      expect(screen.getByRole('dialog').textContent).not.toMatch(
        /(?:Planned|Actual|Status|Time Delay) \(\d+\)/,
      );
      expect(screen.getAllByRole('tab')).toHaveLength(6);
      expect(request.mock.calls.every(([, o]) => !o?.method)).toBe(true);
    },
  );
  it('shows Sheet formula results exactly and read-only in their own step cards', async () => {
    const { snapshot } = fixture();
    snapshot.values[7]![40] = '10/10/2026 03:00 PM';
    snapshot.formulas[7]![40] = '=A8+1';
    snapshot.rows = mapO2DRows(snapshot);
    await tab('Process Status');
    const step4 = within(screen.getByRole('region', { name: /STEP 4 /i }));
    expect((step4.getByLabelText('Planned') as HTMLInputElement).value).toBe(
      '10/10/2026 03:00 PM',
    );
    expect((step4.getByLabelText('Planned') as HTMLInputElement).readOnly).toBe(
      true,
    );
    expect(
      step4.getAllByText('Sheet formula / read only').length,
    ).toBeGreaterThan(0);
  });
  it('sends only the selected date for SR2/SKU2 and refreshes without closing', async () => {
    const { row, onSaved } = fixture();
    await tab('Purchase');
    fireEvent.change(screen.getByLabelText('Jindal Expected Date'), {
      target: { value: '2026-10-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(
      'Changes saved. Values refreshed from Google Sheets.',
    );
    const [path, options] = request.mock.calls.find(
      ([, o]) => o?.method === 'PATCH',
    )!;
    expect(path).toBe(`/api/o2d/fbd/rows/${encodeURIComponent(row.id)}`);
    expect(JSON.parse(options.body)).toEqual({
      version: row.version,
      enquiryNo: 'C/1/26-27',
      srNo: '2',
      sku: 'SKU-2',
      context: 'workflow',
      changes: [{ column: 50, value: '2026-10-09' }],
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('Jindal Expected Date') as HTMLInputElement).value,
    ).toBe('2026-10-09');
  });
  it('retains workflow validation when saving dirty fields after switching to Overview', async () => {
    fixture();
    await tab('Purchase');
    fireEvent.change(screen.getByLabelText('Jindal Expected Date'), {
      target: { value: '2026-10-09' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(
      'Changes saved. Values refreshed from Google Sheets.',
    );
    expect(
      JSON.parse(
        request.mock.calls.find(([, o]) => o?.method === 'PATCH')![1].body,
      ),
    ).toMatchObject({
      context: 'workflow',
      sku: 'SKU-2',
      changes: [{ column: 50, value: '2026-10-09' }],
    });
  });
  it('preserves unsaved edits when saving fails', async () => {
    const { meta } = fixture();
    await tab('Purchase');
    request.mockImplementation(async (path: string) => {
      if (path.includes('/meta')) return meta();
      throw new Error('This material changed. Refresh before saving.');
    });
    fireEvent.change(screen.getByLabelText('Purchase Target Date'), {
      target: { value: '2026-10-12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This material changed.',
    );
    expect(
      (screen.getByLabelText('Purchase Target Date') as HTMLInputElement).value,
    ).toBe('2026-10-12');
  });
  it('retries a failed refresh without repeating the save', async () => {
    const { meta, server } = fixture();
    await tab('Purchase');
    let fail = true;
    request.mockImplementation(
      async (path: string, options?: { method?: string; body?: string }) => {
        if (path.includes('/enquiries/') && fail)
          throw new Error('Sheet unavailable');
        if (path.includes('/meta')) return meta();
        return server(path, options);
      },
    );
    fireEvent.change(screen.getByLabelText('Jindal Expected Date'), {
      target: { value: '2026-10-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/save completed, but refreshed values/);
    expect(
      (
        screen.getByRole('button', {
          name: 'Save changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh material' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(
      request.mock.calls.filter(([, o]) => o?.method === 'PATCH'),
    ).toHaveLength(1);
  });
});

describe('Workflow dropdown cell binding', () => {
  it.each(['FBD', 'MUM'] as const)(
    'keeps %s status selections and payment search bound to their own physical columns',
    async (branch) => {
      const { row } = fixture(branch);
      await tab('Process Status');
      const step4 = within(screen.getByRole('region', { name: /STEP 4 /i }));
      const step5 = within(screen.getByRole('region', { name: /STEP 5 /i }));
      expect(
        within(step4.getByRole('combobox', { name: 'Status' }))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Select...', 'Approved', 'Hold', 'Cancelled']);
      expect(
        within(step5.getByRole('combobox', { name: 'Verification Status' }))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Select...', 'Verified', 'CANCEL']);
      const payment = screen.getByRole('combobox', { name: 'Payment Terms' });
      fireEvent.focus(payment);
      fireEvent.change(payment, { target: { value: 'PCD' } });
      expect(
        (
          screen.getByRole('button', {
            name: 'Save changes',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.click(
        screen.getByRole('option', { name: '90 DAYS PCD CHEQUE' }),
      );
      fireEvent.change(step4.getByRole('combobox', { name: 'Status' }), {
        target: { value: 'Approved' },
      });
      fireEvent.change(
        step5.getByRole('combobox', { name: 'Verification Status' }),
        { target: { value: 'Verified' } },
      );
      await tab('Purchase');
      const step8 = within(screen.getByRole('region', { name: /STEP 8 /i }));
      fireEvent.change(step8.getByRole('combobox', { name: 'Status' }), {
        target: { value: 'Hold' },
      });
      await tab('Dispatch');
      const remarks = screen.getByRole('combobox', {
        name: 'Remarks / Challenges',
      });
      fireEvent.focus(remarks);
      fireEvent.change(remarks, { target: { value: 'payment' } });
      fireEvent.click(
        screen.getByRole('option', { name: 'Awaiting for Payment' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText(
        'Changes saved. Values refreshed from Google Sheets.',
      );
      const [path, options] = request.mock.calls.find(
        ([, o]) => o?.method === 'PATCH',
      )!;
      expect(path).toBe(
        `/api/o2d/${branch.toLowerCase()}/rows/${encodeURIComponent(row.id)}`,
      );
      expect(JSON.parse(options.body)).toMatchObject({
        enquiryNo: row.enquiryNo,
        srNo: '2',
        sku: 'SKU-2',
        context: 'workflow',
        changes: [
          { column: 21, value: '90 DAYS PCD CHEQUE' },
          { column: 43, value: 'Approved' },
          { column: 47, value: 'Verified' },
          { column: 55, value: 'Hold' },
          { column: 66, value: 'Awaiting for Payment' },
        ],
      });
    },
  );
});
