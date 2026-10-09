import { describe, it, expect, vi } from 'vitest';
import { createEnquirySchema } from '@cre/shared';
import {
  businessDate,
  nextEnquiryNumber,
  materialId,
  planCreation,
} from '../src/modules/enquiries/creation.js';
import { mapHeaders, safeLink } from '../src/modules/enquiries/headers.js';
import { withCreationLock } from '../src/modules/enquiries/lock.js';
const headers = [
  'Date',
  'Enquiry No.',
  'Customer Name',
  'Sales Person',
  'Branch',
  'Material Type',
  'SKU',
  'Edge',
  'Qty',
  'LIMIT',
  'Enq Mode',
  'Enquiry Noted Timestamp (Auto)',
  'DB_ID',
  'LAST_EDIT_TS',
  'THK',
  'WIDTH',
  'LGT',
  'FINISH',
  'GRADE',
];
const input = createEnquirySchema.parse({
  type: 'CRR',
  requestId: '82687776-3340-4ea3-a668-edb8e879c747',
  customerName: 'Test customer',
  salesPerson: 'Test sales',
  branch: 'FBD',
  materials: [
    {
      materialType: 'Sheet',
      sku: '1-1250-2500-2B-304-L',
      edge: 'ME',
      qty: 10,
      limit: '',
      mode: 'Mail',
    },
    {
      materialType: 'Sheet',
      sku: '2-1250-2500-2B-304',
      edge: 'TE',
      qty: 20,
      limit: '',
      mode: 'Whatsapp',
    },
  ],
});
describe('safe enquiry creation rules', () => {
  it('uses India date and April-March financial years with source-specific sequences', () => {
    expect(businessDate(new Date('2026-03-31T19:00:00Z'))).toBe('2026-04-01');
    expect(
      nextEnquiryNumber(
        'CRR',
        ['C/237/26-27', 'N/999/26-27', 'C/999/25-26'],
        '2026-04-01',
      ),
    ).toBe('C/238/26-27');
    expect(nextEnquiryNumber('NBD', ['N/12/25-26'], '2026-03-31')).toBe(
      'N/13/25-26',
    );
  });
  it('groups multiple materials, preserves grade suffixes and generates deterministic UUID identities', () => {
    const plan = planCreation(
      input,
      [headers],
      1,
      2,
      new Date('2026-10-07T00:00:00Z'),
    );
    expect(plan.materials).toHaveLength(2);
    expect(plan.materials[0]?.find((c) => c.name === 'GRADE')?.value).toBe(
      '304-L',
    );
    expect(
      plan.materials.every(
        (cells) =>
          cells.find((c) => c.name === 'Enquiry No.')?.value === 'C/1/26-27',
      ),
    ).toBe(true);
    expect(materialId(input.requestId, 0)).not.toBe(
      materialId(input.requestId, 1),
    );
  });
  it('does not write derived formulas and refuses formula-managed manual fields', () => {
    const row = Array(headers.length).fill('') as string[];
    row[1] = 'C/5/26-27';
    row[14] = '=ARRAYFORMULA(A2:A)';
    expect(
      planCreation(input, [headers, row], 1, 2).materials[0]?.some(
        (c) => c.name === 'THK',
      ),
    ).toBe(false);
    row[8] = '=SUM(A2:A)';
    expect(() => planCreation(input, [headers, row], 1, 2)).toThrow(
      'Qty is formula-managed',
    );
  });
  it('replays an already saved request and rejects a changed payload using that ID', () => {
    const planned = planCreation(input, [headers], 1, 2);
    const rows = planned.materials.map((fields) => {
      const row = Array(headers.length).fill('') as string[];
      fields.forEach((f) => (row[f.column] = String(f.value)));
      return row;
    });
    expect(planCreation(input, [headers, ...rows], 1, 2).replayed).toBe(true);
    expect(() =>
      planCreation(
        { ...input, customerName: 'Different' },
        [headers, ...rows],
        1,
        2,
      ),
    ).toThrow('different material details');
  });
  it('permits insertion ahead of verified per-row timestamp templates without overwriting them', () => {
    const row = Array(headers.length).fill('') as string[];
    row[11] = '=if(C2<>"",if(U2="",NOW(),U2),"")';
    const plan = planCreation(input, [headers, row], 1, 2);
    expect(plan.insertionIndex).toBe(1);
    expect(
      plan.materials[0]?.some(
        (field) => field.name === 'Enquiry Noted Timestamp (Auto)',
      ),
    ).toBe(true);
    row[11] = '=ARRAYFORMULA(NOW())';
    expect(() => planCreation(input, [headers, row], 1, 2)).toThrow(
      'formula-managed',
    );
  });
  it('rejects zero quantities, ambiguous headers and unsafe links', () => {
    expect(
      createEnquirySchema.safeParse({
        ...input,
        materials: [{ ...input.materials[0], qty: 0 }],
      }).success,
    ).toBe(false);
    expect(mapHeaders(['Won/ Loss', 'Status Date (Auto)\n'])('won/loss')).toBe(
      0,
    );
    expect(() => mapHeaders(['Status', 'Status'])('Status')).toThrow(
      'Ambiguous',
    );
    expect(safeLink('javascript:alert(1)')).toBeNull();
  });
  it('blocks concurrent same-host creation and releases the lock after failures', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => (entered = resolve));
    const first = withCreationLock(async () => {
      entered();
      await gate;
    });
    await ready;
    try {
      await expect(withCreationLock(async () => true)).rejects.toThrow(
        'Another enquiry',
      );
    } finally {
      release();
      await first;
    }
    await expect(
      withCreationLock(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    const action = vi.fn(async () => true);
    expect(await withCreationLock(action)).toBe(true);
  });
});
