import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  DispatchOrderService,
  dispatchFilename,
  dispatchTotals,
} from './service.js';
import { dispatchFixture } from './fixture.js';
import { dispatchPartyRecords, transporterRecords } from './masters.js';
import { dispatchEmailSchema } from './schema.js';
import type { O2DRepository } from '../o2d/repository.js';
import type { renderPdf } from '../documents/pdf.js';
import { dispatchHtml } from './template.js';
const input = () => ({
  enquiryNo: 'C/1/26-27',
  srNos: ['1', '3'],
  overrides: {},
  requestId: randomUUID(),
});
function harness() {
  const f = dispatchFixture();
  const load = vi.fn(async () => f.snapshot);
  const commit = vi.fn<O2DRepository['commit']>().mockResolvedValue(undefined);
  const pdf = vi
    .fn<typeof renderPdf>()
    .mockResolvedValue(Buffer.from('%PDF-fixture'));
  const upload = vi.fn(async () => ({
    id: 'pdf-1',
    url: 'https://drive.google.com/file/d/pdf-1/view',
  }));
  const folder = vi.fn(async () => ({ name: 'Dispatch', driveId: 'shared' }));
  const email = vi.fn(async () => ({ messageId: 'sent-1' }));
  const service = new DispatchOrderService(
    f.env,
    { load, commit, steps: async (_s, r) => f.layoutFor(r) },
    f.masters,
    pdf,
    upload,
    folder,
    email,
  );
  return { ...f, service, load, commit, pdf, upload, folder, email };
}
describe('Dispatch Order migration', () => {
  it.each(['FBD', 'MUM'] as const)(
    'builds %s selected enquiry/Srs with the legacy design',
    async (branch) => {
      const f = dispatchFixture(branch);
      const r = await f
        .service()
        .preview(branch, {
          ...input(),
          overrides: { transporterName: 'Example Transport' },
        });
      expect(r.document.selectedSrNos).toEqual(['1', '3']);
      expect(r.document.lines.map((l) => l.srNo)).toEqual(['1', '3']);
      expect(r.document.lines[0]).toMatchObject({
        lotNo: 'LOT-1\nLOT-1B',
        qty: '100.5',
        unitPrice: '120.25',
      });
      expect(r.document).toMatchObject({
        billToAddress: 'Bill address from master',
        shipToAddress: 'Ship address from master',
        transporterGST: '06TRANSPORT00000',
        termsOfDelivery: 'Destination',
      });
      expect(r.document.dispatchFromAddress).toContain(
        branch === 'FBD' ? 'FARIDABAD' : 'Navi Mumbai',
      );
      for (const text of [
        'Enquiry No:',
        'Consignee (Ship To)',
        'Buyer (Bill to)',
        'LOT NO.',
        'Transporter GSTIN:',
        'Other Charges',
        'Pkg. & Loading Charges',
        'GST (18%)',
        'Computer Generated',
      ])
        expect(r.html).toContain(text);
      expect(r.html).not.toContain('Sales Order No');
      expect(r.html).not.toContain('DRAFT');
    },
  );
  it('rejects duplicate/missing serials, mixed customers, unapproved or stale rows', async () => {
    const f = dispatchFixture(),
      s = f.service();
    await expect(
      s.buildDocument('FBD', { ...input(), srNos: ['1', '1'] }),
    ).rejects.toMatchObject({ code: 'ROW_SELECTION_INVALID' });
    await expect(
      s.buildDocument('FBD', { ...input(), srNos: ['4'] }),
    ).rejects.toMatchObject({ code: 'ROW_SELECTION_INVALID' });
    f.set(3, 'Customer Name', 'Other');
    await expect(s.buildDocument('FBD', input())).rejects.toMatchObject({
      code: 'CUSTOMER_MISMATCH',
    });
    f.set(3, 'Customer Name', 'A2z Filtration');
    f.set(3, 'Status PR', 'Hold');
    await expect(s.buildDocument('FBD', input())).rejects.toMatchObject({
      code: 'DISPATCH_NOT_APPROVED',
    });
    await expect(
      s.buildDocument('FBD', { ...input(), versions: { '1': 'stale' } }),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
  });
  it('filters eligible enquiry choices by mapped Step 8 approval', async () => {
    const f = dispatchFixture();
    for (const sr of [1, 2, 3]) f.set(sr, 'Status PR', 'Hold');
    expect((await f.service().enquiries('FBD')).enquiries).toEqual([]);
    f.set(2, 'Status PR', 'Approved');
    expect((await f.service().enquiries('FBD')).enquiries).toEqual([
      'C/1/26-27',
    ]);
  });
  it('uses decimal rounding and zero GST and rejects invalid charges', () => {
    const r = dispatchTotals(
      [{ qty: '0.1', unitPrice: '0.2' }] as never,
      0.1,
      0.2,
      0,
    );
    expect(r).toMatchObject({
      goodsTotal: '0.02',
      taxableTotal: '0.32',
      gstAmount: '0.00',
      grandTotal: '0.32',
    });
    expect(() => dispatchTotals([], 0, 0, 101)).toThrow('GST rate');
    expect(() => dispatchTotals([], -1, 0, 18)).toThrow('non-negative');
  });
  it('keeps distinct party GSTINs and detects conflicting masters', () => {
    const rows = [
      ['Customer Name', 'State', 'Bill To', 'GSTIN', 'Ship To', 'GSTIN'],
      ['Example', '', 'B address', 'B-GST', 'S address', 'S-GST'],
    ];
    expect(dispatchPartyRecords(rows, ' example ')).toMatchObject({
      billToAddress: 'B address',
      billGSTIN: 'B-GST',
      shipToAddress: 'S address',
      shipGSTIN: 'S-GST',
    });
    expect(() =>
      dispatchPartyRecords(
        [...rows, ['Example', '', 'Different', 'B-GST', 'S address', 'S-GST']],
        'Example',
      ),
    ).toThrow('Multiple different');
    expect(
      transporterRecords([
        ['TRASPORTER NAME', 'GSTIN'],
        ['Truck A', 'GST-A'],
      ]),
    ).toEqual([{ name: 'Truck A', gstin: 'GST-A' }]);
  });
  it('writes only selected links and is idempotent on retry', async () => {
    const h = harness(),
      i = input(),
      before = structuredClone(h.snapshot.values);
    const result = await h.service.save('FBD', i);
    expect(result.updatedRows).toBe(2);
    const requests = h.commit.mock.calls[0]![1] as {
      updateCells?: {
        start: { sheetId: number; rowIndex: number; columnIndex: number };
      };
    }[];
    const writes = requests.flatMap((r) =>
      r.updateCells?.start.sheetId === 0 ? [r.updateCells.start] : [],
    );
    expect(writes).toEqual([
      { sheetId: 0, rowIndex: 6, columnIndex: 58 },
      { sheetId: 0, rowIndex: 8, columnIndex: 58 },
    ]);
    expect(h.snapshot.values).toEqual(before);
    expect(await h.service.save('FBD', i)).toEqual(result);
    expect(h.upload).toHaveBeenCalledTimes(1);
  });
  it('blocks protected formulas before upload and rechecks after rendering', async () => {
    const h = harness();
    h.set(1, 'Dispatch Order link', '=HYPERLINK("x")');
    await expect(h.service.save('FBD', input())).rejects.toMatchObject({
      code: 'DISPATCH_LINK_PROTECTED',
    });
    expect(h.upload).not.toHaveBeenCalled();
    const h2 = harness();
    h2.pdf.mockImplementation(async () => {
      h2.set(3, 'Status PR', 'Cancelled');
      return Buffer.from('pdf');
    });
    await expect(h2.service.save('FBD', input())).rejects.toMatchObject({
      code: 'ROW_CHANGED',
    });
    expect(h2.upload).not.toHaveBeenCalled();
  });
  it('retains the file on uncertain writes and refuses blind retries', async () => {
    const h = harness(),
      i = input();
    h.commit.mockRejectedValue(new Error('timeout'));
    await expect(h.service.save('FBD', i)).rejects.toThrow(
      'https://drive.google.com/file/d/pdf-1/view',
    );
    await expect(h.service.save('FBD', i)).rejects.toMatchObject({
      code: 'DISPATCH_UNCONFIRMED',
    });
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.email).not.toHaveBeenCalled();
  });
  it('emails the generated PDF only after link storage', async () => {
    const h = harness();
    await h.service.save(
      'FBD',
      input(),
      dispatchEmailSchema.parse({
        to: 'buyer@example.test',
        cc: 'copy@example.test',
      }),
    );
    expect(h.email).toHaveBeenCalledWith(
      h.env,
      expect.objectContaining({
        subject: 'Dispatch Order - C/1/26-27',
        to: ['buyer@example.test'],
      }),
      Buffer.from('%PDF-fixture'),
      expect.stringMatching(/^Dispatch_Order_C_1_26-27_/),
    );
    expect(h.commit.mock.invocationCallOrder[0]).toBeLessThan(
      h.email.mock.invocationCallOrder[0]!,
    );
  });
  it('download uses the same template with no Drive or Sheet changes', async () => {
    const h = harness();
    const p = await h.service.preview('FBD', input());
    await h.service.download('FBD', { ...input(), fingerprint: p.fingerprint });
    expect(h.pdf.mock.calls[0]?.[1]).toBe(dispatchHtml(p.document));
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });
  it('escapes HTML, sanitizes filenames and refuses stale previews', async () => {
    const f = dispatchFixture();
    const p = await f
      .service()
      .preview('FBD', {
        ...input(),
        overrides: { deliveryLocation: '<script>bad()</script>' },
      });
    expect(p.html).toContain('&lt;script&gt;');
    expect(p.html).not.toContain('<script>');
    expect(
      dispatchFilename('C/1\\2:*?"<>|', new Date('2026-10-09T07:30:00Z')),
    ).toMatch(/^Dispatch_Order_C_1_2_+2026-10-09_130000.pdf$/);
    await expect(
      f.service().download('FBD', { ...input(), fingerprint: 'wrong' }),
    ).rejects.toMatchObject({ code: 'DISPATCH_PREVIEW_CHANGED' });
  });
});
