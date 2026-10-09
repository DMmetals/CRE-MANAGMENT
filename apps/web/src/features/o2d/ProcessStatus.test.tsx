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
  data.options[36] = ['From Sheet only', 'POP', 'Additional stock'];
  data.snapshot.formulas[6]![27] = '=V7+1/24';
  data.snapshot.rows = mapO2DRows(data.snapshot);
  const meta = () => ({
    stepLayout: data.layoutFor(7),
    row: data.snapshot.rows[0],
  });
  const server = async (
    path: string,
    options?: { method?: string; body?: string },
  ) => {
    if (path.includes('/meta')) return meta();
    if (path.includes('/enquiries/')) return { rows: data.snapshot.rows };
    if (options?.method === 'PATCH') {
      for (const c of JSON.parse(options.body!).changes) {
        data.snapshot.values[6]![c.column - 1] = c.value;
        data.snapshot.formulas[6]![c.column - 1] = c.value;
      }
      data.snapshot.rows = mapO2DRows(data.snapshot);
      return { updatedRows: 1, protectedFields: [] };
    }
    return [];
  };
  request.mockImplementation(server);
  const onSaved = vi.fn(),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <O2DDetail
        row={data.snapshot.rows[0]!}
        branch={branch}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { ...data, meta, server, onSaved };
}
async function processTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Process Status' }));
  await screen.findByRole('region', {
    name: /STEP 2 Order Verification & sign/i,
  });
}
describe('Sheet-driven Process Status drawer', () => {
  it.each(['FBD', 'MUM'] as const)(
    'shows Steps 2-5 and separate PO receipt controls in %s',
    async (branch) => {
      fixture(branch);
      await processTab();
      for (const step of [2, 3, 4, 5])
        expect(
          screen.getByRole('region', {
            name: new RegExp(`STEP ${step} `, 'i'),
          }),
        ).toBeTruthy();
      const step2 = within(screen.getByRole('region', { name: /STEP 2 /i }));
      expect(step2.getByRole('combobox', { name: 'Status' })).toBeTruthy();
      expect(
        within(step2.getByRole('combobox', { name: 'Status' }))
          .getAllByRole('option')
          .map((o) => (o as HTMLOptionElement).value),
      ).toEqual(['', 'Verified', 'CANCEL']);
      for (const name of [
        'Terms & Condition',
        'Size & Rate Approval',
        'Material Status',
        'PO Approval Status',
      ])
        expect(screen.getByRole('combobox', { name })).toBeTruthy();
      fireEvent.focus(
        screen.getByRole('combobox', { name: 'Material Status' }),
      );
      expect(
        within(screen.getByRole('listbox', { name: 'Material Status options' }))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Select...', 'From Sheet only', 'POP', 'Additional stock']);
      fireEvent.keyDown(
        screen.getByRole('combobox', { name: 'Material Status' }),
        { key: 'Escape' },
      );
      expect(screen.getByLabelText('CRDD').getAttribute('type')).toBe('date');
      expect(screen.getByLabelText('Lot NO.').getAttribute('type')).toBe(
        'text',
      );
      expect(
        (step2.getByLabelText('Planned') as HTMLInputElement).readOnly,
      ).toBe(true);
      expect(
        (
          within(
            screen.getByRole('region', { name: /STEP 3 /i }),
          ).getByLabelText('Planned') as HTMLInputElement
        ).readOnly,
      ).toBe(true);
      expect(
        screen.getByRole('button', { name: 'Upload PO Copy' }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Upload Revised PO' }),
      ).toBeTruthy();
      expect(
        step2.queryByRole('button', { name: 'Upload PO Copy' }),
      ).toBeNull();
      expect(screen.getAllByRole('tab')).toHaveLength(6);
      expect(screen.queryByLabelText('Purchase Target Date')).toBeNull();
    },
  );
  it('sends only dirty editable fields with exact identity and refreshes without closing', async () => {
    const { snapshot, onSaved } = fixture(),
      row = snapshot.rows[0]!;
    await processTab();
    const lot = screen.getByLabelText('Lot NO.');
    fireEvent.change(lot, { target: { value: 'LOT123' } });
    fireEvent.change(lot, { target: { value: '' } });
    expect(
      (
        screen.getByRole('button', {
          name: 'Save changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Terms & Condition' }),
      { target: { value: 'Approved' } },
    );
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
      srNo: '1',
      sku: 'SKU-1',
      context: 'workflow',
      changes: [{ column: 34, value: 'Approved' }],
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('keeps multipart PO upload, duplicate-click protection, dirty edits and the new version', async () => {
    const { snapshot, server } = fixture();
    await processTab();
    fireEvent.change(screen.getByLabelText('Lot NO.'), {
      target: { value: 'LOT123' },
    });
    let finish!: (result: unknown) => void;
    request.mockImplementation(
      (path: string, options?: { method?: string; body?: string }) =>
        path.endsWith('/po')
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : server(path, options),
    );
    fireEvent.change(screen.getByLabelText('Choose PO Copy'), {
      target: {
        files: [
          new File(['%PDF-fixture'], 'PO.pdf', { type: 'application/pdf' }),
        ],
      },
    });
    await screen.findByRole('button', { name: 'Uploading...' });
    expect(
      (
        screen.getByRole('button', {
          name: 'Uploading...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const form = request.mock.calls.find(([p]) => p.endsWith('/po'))![1]
      .body as FormData;
    expect(form.get('enquiryNo')).toBe('C/1/26-27');
    expect(form.get('srNo')).toBe('1');
    expect(form.get('type')).toBe('PO');
    snapshot.values[6]![24] = 'https://drive.google.com/file/d/new/view';
    snapshot.formulas[6]![24] = snapshot.values[6]![24]!;
    snapshot.rows = mapO2DRows(snapshot);
    const next = snapshot.rows[0]!;
    finish({ url: next.fields[24]!.value, row: next, refreshRequired: false });
    await screen.findByText('PO uploaded successfully.');
    await screen.findByRole('button', { name: 'Replace PO' });
    expect(
      screen.getByRole('link', { name: 'View PO' }).getAttribute('target'),
    ).toBe('_blank');
    expect((screen.getByLabelText('Lot NO.') as HTMLInputElement).value).toBe(
      'LOT123',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(request.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(
        true,
      ),
    );
    expect(
      JSON.parse(
        request.mock.calls.find(([, o]) => o?.method === 'PATCH')![1].body,
      ),
    ).toMatchObject({
      version: next.version,
      changes: [{ column: 37, value: 'LOT123' }],
    });
  });
  it('preserves revised PO upload errors and write-disabled controls', async () => {
    const { meta } = fixture('MUM');
    await processTab();
    request.mockImplementation(async (path: string) => {
      if (path.includes('/meta')) return meta();
      throw new Error('The material moved. Refresh before uploading.');
    });
    fireEvent.change(screen.getByLabelText('Choose Revised PO Copy'), {
      target: {
        files: [
          new File(['%PDF-fixture'], 'Revised.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The material moved. Refresh before uploading.',
    );
    expect(
      (
        request.mock.calls.find(([p]) => p.endsWith('/po'))![1].body as FormData
      ).get('type'),
    ).toBe('REVISED_PO');
  });
  it('shows disabled writes without enabling PO uploads', async () => {
    const { meta } = fixture();
    request.mockImplementation(async () => ({
      ...meta(),
      stepLayout: { ...meta().stepLayout, writesEnabled: false },
    }));
    await processTab();
    expect(
      screen.getByText(
        'Sheet writes are disabled. Workflow fields are available to view.',
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Upload PO Copy',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Terms & Condition',
        }) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
  });
});
