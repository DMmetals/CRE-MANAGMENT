import { describe, it, expect } from 'vitest';
import { O2DHeaderMap } from './headers.js';
import { isCellProtected, type O2DSnapshot } from './repository.js';
describe('O2D repeated headers and formula output', () => {
  it('requires an occurrence for repeated headers and resolves invoice blocks independently', () => {
    const block = [
      'Planned Dispatch Date',
      'Qty Dispatched',
      'Dispatch Date',
      'Invoice No.',
      'Invoice Date',
      'Invoice Value',
      'Invoice Due Date',
    ];
    const map = new O2DHeaderMap([
      'Sr no',
      'Enquiry No.',
      'Planned ',
      'Planned',
      ...block,
      ...block,
    ]);
    expect(() => map.findColumn('Planned')).toThrow('occurs 2 times');
    expect(map.findColumn('Planned', 2)).toBe(3);
    expect(map.findColumn('Invoice No.', 2)).toBe(14);
    expect(map.findColumn('Invoice No.', undefined, 'Invoice 2')).toBe(14);
    expect(
      map.duplicateHeaders.find((h) => h.header === 'Invoice No.')?.columns,
    ).toEqual([8, 15]);
    expect(
      () =>
        new O2DHeaderMap([
          'Planned Dispatch Date',
          'Wrong field',
          ...block.slice(2),
        ]),
    ).toThrow('Invoice section header changed');
  });
  it('protects header and data-row array outputs while respecting permitted manual cells', () => {
    const snapshot = {
      source: {
        id: 'fixture',
        sheetId: 0,
        tab: 'FBD',
        header: 1,
        rowCount: 20,
      },
      formulas: [
        ['Sr no', 'Address'],
        ['', '=ARRAYFORMULA(C2:C)'],
      ],
      protectedRanges: [
        {
          range: { sheetId: 0, startColumnIndex: 0, endColumnIndex: 1 },
          requestingUserCanEdit: true,
        },
      ],
    } as O2DSnapshot;
    expect(isCellProtected(snapshot, 4, 1)).toBe(true);
    expect(isCellProtected(snapshot, 4, 0)).toBe(false);
    snapshot.protectedRanges[0]!.requestingUserCanEdit = false;
    expect(isCellProtected(snapshot, 4, 0)).toBe(true);
    snapshot.protectedRanges[0]!.warningOnly = true;
    expect(isCellProtected(snapshot, 4, 0)).toBe(false);
  });
});
