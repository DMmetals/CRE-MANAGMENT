import { describe, it, expect, vi } from 'vitest';
import { dateSerial } from '@cre/shared';
import { stepsFixture } from './steps-fixture.js';
import {
  buildStepLayout,
  sheetStepGroups,
  workflowDisplayValue,
} from './steps.js';
import {
  paymentTermsOptions,
  materialStatusOptions,
  remarksOptions,
} from './step-dropdowns.js';
import { O2DUpdateService } from './updates.js';
import { parseEnv } from '../../config/env.js';
import { mapO2DRows, type O2DRepository } from './repository.js';
import { O2DHeaderMap } from './headers.js';
const env = parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'true' });
describe('Sheet-derived O2D steps', () => {
  it.each(['FBD', 'MUM'] as const)(
    'uses merged headers and independent branch numbering in %s',
    (branch) => {
      const { layoutFor } = stepsFixture(branch),
        layout = layoutFor();
      expect(
        layout.steps
          .filter((s) => s.tab === 'Process Status')
          .map((s) => s.stepNumber),
      ).toEqual([null, 2, 3, 4, 5]);
      expect(
        layout.steps
          .filter((s) => s.tab === 'Purchase')
          .map((s) => s.stepNumber),
      ).toEqual([7, 8]);
      expect(
        layout.steps
          .filter((s) => s.tab === 'Dispatch')
          .map((s) => s.stepNumber),
      ).toEqual([9, branch === 'FBD' ? 10 : 6, null]);
      const ranges = layout.steps
        .filter((s) => s.stepNumber)
        .map((s) => [s.stepNumber, s.fields.map((f) => f.letter).join(',')]);
      expect(ranges).toContainEqual([4, 'AO,AP,AQ,AR']);
      expect(ranges).toContainEqual([5, 'AS,AT,AU,AV']);
      expect(ranges).toContainEqual([7, 'AW,AX,AY,AZ']);
      expect(ranges).toContainEqual([8, 'BA,BB,BC,BD']);
      expect(ranges).toContainEqual([9, 'BE,BF,BG,BH']);
      expect(ranges).toContainEqual([
        branch === 'FBD' ? 10 : 6,
        'BI,BJ,BK,BL,BN,BO',
      ]);
      expect(layout.steps.at(-1)!.fields.map((f) => f.letter)).toEqual([
        'BP',
        'BQ',
        'BR',
      ]);
      expect(layout.steps.find((s) => s.stepNumber === 4)).toMatchObject({
        title: 'Limit Approval',
        who: 'Dinesh',
        how: 'As per Balance Limit & Payment Cycle',
        sla: '2:00:00',
      });
      expect(
        layout.steps.flatMap((s) => s.fields).some((f) => f.letter === 'BM'),
      ).toBe(false);
      expect(
        layout.steps
          .flatMap((s) => s.fields)
          .some((f) => /\(\d+\)|Column BM/.test(f.label)),
      ).toBe(false);
    },
  );
  it('keeps receipt and PO columns separate from the actual AB:AE Step 2 merge', () => {
    const { layoutFor } = stepsFixture();
    const layout = layoutFor();
    expect(layout.steps[0]!.fields.map((f) => f.letter)).toEqual([
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
      'AA',
    ]);
    expect(
      layout.steps.find((s) => s.stepNumber === 2)!.fields.map((f) => f.letter),
    ).toEqual(['AB', 'AC', 'AD', 'AE']);
    expect(
      layout.steps[0]!.fields.filter(
        (f) => f.inputType === 'po' || f.inputType === 'revised-po',
      ),
    ).toHaveLength(2);
  });
  it('preserves evaluated formula text and protects every planned/delay field', () => {
    const { snapshot, gridFor } = stepsFixture();
    snapshot.values[6]![40] = '10/10/2026 03:00 PM';
    snapshot.formulas[6]![40] = '=A7+2';
    snapshot.values[6]![41] = '10/10/2026 04:00 PM';
    snapshot.formulas[6]![41] = '=A7+3';
    snapshot.rows = mapO2DRows(snapshot);
    const grid = gridFor();
    grid.sheets[0]!.data![1]!.rowData![0]!.values![40]!.effectiveValue = {
      numberValue: 46305.625,
    };
    const fields = buildStepLayout(snapshot, 7, grid, {}, true).steps.flatMap(
      (s) => s.fields,
    );
    expect(fields.find((f) => f.letter === 'AO')).toMatchObject({
      value: '10/10/2026 03:00 PM',
      formattedValue: '10/10/2026 03:00 PM',
      rawValue: '=A7+2',
      effectiveValue: 46305.625,
      formula: '=A7+2',
      hasFormula: true,
      editable: false,
      label: 'Planned',
    });
    expect(fields.find((f) => f.letter === 'AP')).toMatchObject({
      hasFormula: true,
      editable: false,
      value: '10/10/2026 04:00 PM',
    });
    for (const f of fields.filter(
      (f) => f.label === 'Planned' || f.label === 'Time Delay',
    ))
      expect(f.editable).toBe(false);
  });
  it('uses actual validation including additional choices and supplied remarks only as fallback', () => {
    const { snapshot, gridFor } = stepsFixture();
    const options = {
      30: ['Signed', 'Awaiting'],
      34: ['Approved', 'Special Hold'],
      64: ['Transport A', 'Transport B'],
      70: ['Move', 'Keep'],
    };
    const layout = buildStepLayout(snapshot, 7, gridFor(), options, true),
      fields = layout.steps.flatMap((s) => s.fields);
    expect(fields.find((f) => f.column === 30)).toMatchObject({
      validationSource: 'sheet',
      validationOptions: ['Signed', 'Awaiting'],
      inputType: 'select',
    });
    expect(
      layout.warnings.some((w) =>
        w.startsWith('Order Verification validation differs'),
      ),
    ).toBe(true);
    expect(fields.find((f) => f.column === 64)).toMatchObject({
      validationOptions: ['Transport A', 'Transport B'],
      inputType: 'select',
    });
    expect(fields.find((f) => f.column === 70)).toMatchObject({
      validationOptions: ['Move', 'Keep'],
      inputType: 'select',
    });
    expect(fields.find((f) => f.column === 66)).toMatchObject({
      inputType: 'select',
      validationSource: 'supplied-default',
      validationOptions: remarksOptions,
    });
    expect(fields.find((f) => f.column === 37)!.inputType).toBe('text');
  });
  it('maps a branch with shifted columns from its merged ranges rather than fixed letters', () => {
    const { snapshot, merges, gridFor } = stepsFixture();
    snapshot.values.forEach((r) => r.splice(40, 0, ''));
    snapshot.formulas.forEach((r) => r.splice(40, 0, ''));
    merges.forEach((m) => {
      if (m.startColumnIndex >= 40) m.startColumnIndex++;
      if (m.endColumnIndex > 40) m.endColumnIndex++;
    });
    snapshot.headerMap = new O2DHeaderMap(snapshot.values[5]!);
    snapshot.rows = mapO2DRows(snapshot);
    const layout = buildStepLayout(snapshot, 7, gridFor(), {}, true);
    expect(
      layout.steps.find((s) => s.stepNumber === 4)!.fields.map((f) => f.letter),
    ).toEqual(['AP', 'AQ', 'AR', 'AS']);
  });
  it('fails closed for missing merged headings and changed displayed row values', () => {
    const { snapshot, gridFor } = stepsFixture();
    const missing = gridFor();
    missing.sheets[0]!.merges = missing.sheets[0]!.merges!.filter(
      (m) => !(m.startRowIndex === 0 && m.startColumnIndex === 40),
    );
    expect(() => sheetStepGroups(snapshot, missing)).toThrow(
      'no merged column range',
    );
    const stale = gridFor();
    stale.sheets[0]!.data![1]!.rowData![0]!.values![40]!.formattedValue =
      'Changed';
    expect(() => buildStepLayout(snapshot, 7, stale, {}, true)).toThrow(
      'material changed',
    );
  });
  it('saves only SR2/SKU2 dirty cells with existing Actual logic, never overwriting formulas or neighbors', async () => {
    const { snapshot, layoutFor } = stepsFixture();
    const before = structuredClone(snapshot.values),
      formula = snapshot.formulas[7]![40];
    const repository = {
      load: vi.fn(async () => snapshot),
      steps: vi.fn(async (_snapshot, rowNumber) => layoutFor(rowNumber)),
      commit: vi.fn<O2DRepository['commit']>().mockResolvedValue(undefined),
    };
    const service = new O2DUpdateService(env, repository);
    const row = snapshot.rows[1]!;
    const input = {
      id: row.id,
      version: row.version,
      enquiryNo: row.enquiryNo,
      srNo: row.srNo,
      sku: row.sku,
      context: 'workflow' as const,
      changes: [
        { column: 43, value: 'Approved' },
        { column: 49, value: '2026-10-10' },
        { column: 66, value: 'Awaiting for Payment' },
        { column: 30, value: 'Verified' },
        { column: 37, value: 'Lot-02' },
      ],
    };
    await service.update('FBD', [input]);
    const requests = repository.commit.mock.calls[0]![1] as {
      updateCells?: {
        start: { sheetId: number; rowIndex: number; columnIndex: number };
        rows: { values: { userEnteredValue: unknown }[] }[];
      };
      appendCells?: {
        rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
      };
    }[];
    const cells = requests.flatMap((r) =>
      r.updateCells?.start.sheetId === 0 ? [r.updateCells] : [],
    );
    expect(cells.map((c) => c.start.columnIndex)).toEqual([
      42, 41, 48, 65, 29, 36,
    ]);
    const actions = requests.flatMap(
      (r) =>
        r.appendCells?.rows.map(
          (r) => r.values[2]!.userEnteredValue.stringValue,
        ) ?? [],
    );
    expect(actions).toContain('UPDATE_ORDER_VERIFICATION');
    expect(actions).toContain('UPDATE_LOT_NO');
    expect(cells.every((c) => c.start.rowIndex === 7)).toBe(true);
    expect(
      cells.find((c) => c.start.columnIndex === 48)!.rows[0]!.values[0]!
        .userEnteredValue,
    ).toEqual({ numberValue: dateSerial('2026-10-10') });
    expect(snapshot.values).toEqual(before);
    expect(snapshot.formulas[7]![40]).toBe(formula);
    repository.commit.mockClear();
    await expect(
      service.update('FBD', [
        { ...input, changes: [{ column: 57, value: 'manual planned' }] },
      ]),
    ).rejects.toMatchObject({ code: 'FIELD_READ_ONLY' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
});

describe('O2D dropdown metadata and physical-column saves', () => {
  it.each(['FBD', 'MUM'] as const)(
    'prefers each %s Sheet list over supplied fallbacks',
    (branch) => {
      const { snapshot, gridFor } = stepsFixture(branch);
      const options = {
        21: ['Sheet payment'],
        36: ['AJ only'],
        43: ['Approved', 'Sheet hold'],
        47: ['Verified', 'CANCEL', 'Sheet verification'],
        55: ['Dispatch approval only'],
        66: ['Sheet remark'],
      };
      const fields = buildStepLayout(
        snapshot,
        7,
        gridFor(),
        options,
        true,
      ).steps.flatMap((s) => s.fields);
      for (const [column, choices] of Object.entries(options)) {
        expect(fields.find((f) => f.column === Number(column))).toMatchObject({
          inputType: 'select',
          validationOptions: choices,
          validationSource: 'sheet',
        });
      }
      const defaults = buildStepLayout(
        snapshot,
        7,
        gridFor(),
        {},
        true,
      ).steps.flatMap((s) => s.fields);
      expect(defaults.find((f) => f.column === 43)!.validationOptions).toEqual([
        'Approved',
        'Hold',
        'Cancelled',
      ]);
      expect(defaults.find((f) => f.column === 47)!.validationOptions).toEqual([
        'Verified',
        'CANCEL',
      ]);
      expect(defaults.find((f) => f.column === 55)!.validationOptions).toEqual([
        'Approved',
        'Hold',
        'Cancelled',
      ]);
      expect(defaults.find((f) => f.column === 36)!.validationOptions).toEqual(
        materialStatusOptions,
      );
      expect(defaults.find((f) => f.column === 66)!.validationOptions).toEqual(
        remarksOptions,
      );
      expect(defaults.find((f) => f.column === 21)!.validationOptions).toEqual(
        paymentTermsOptions,
      );
      expect(paymentTermsOptions).toHaveLength(19);
      expect(new Set(paymentTermsOptions).size).toBe(19);
      expect(paymentTermsOptions).not.toContain('INCULSIVE');
      expect(paymentTermsOptions).not.toContain('EXTRA');
    },
  );
  it.each(['FBD', 'MUM'] as const)(
    'saves independent %s controls only to the selected SR2 physical cells',
    async (branch) => {
      const { snapshot, layoutFor, options } = stepsFixture(branch);
      // This isolated variant has Material Status SG in the otherwise blank BM column.
      snapshot.values[5]![64] = 'Material Status SG';
      snapshot.formulas[5]![64] = 'Material Status SG';
      snapshot.headerMap = new O2DHeaderMap(snapshot.values[5]!);
      options[36] = ['Material In Stock'];
      options[65] = ['Yard Material', 'Branch-specific stock'];
      for (const column of [41, 45, 53]) {
        snapshot.values[7]![column] = '08/10/2026 10:00 AM';
        snapshot.formulas[7]![column] = snapshot.values[7]![column]!;
      }
      snapshot.rows = mapO2DRows(snapshot);
      const before = structuredClone(snapshot.values),
        row = snapshot.rows[1]!;
      const repository = {
        load: vi.fn(async () => snapshot),
        steps: vi.fn(async (_s, n) => layoutFor(n)),
        commit: vi.fn<O2DRepository['commit']>().mockResolvedValue(undefined),
      };
      const service = new O2DUpdateService(env, repository);
      for (const [column, value] of [
        [21, '90 DAYS PCD CHEQUE'],
        [36, 'Material In Stock'],
        [43, 'Approved'],
        [47, 'Verified'],
        [55, 'Hold'],
        [65, 'Yard Material'],
        [66, 'Awaiting for Payment'],
      ] as const) {
        repository.commit.mockClear();
        await service.update(branch, [
          {
            id: row.id,
            version: row.version,
            enquiryNo: row.enquiryNo,
            srNo: row.srNo,
            sku: row.sku,
            context: 'workflow',
            changes: [{ column, value }],
          },
        ]);
        const requests = repository.commit.mock.calls[0]![1] as {
          updateCells?: {
            start: { sheetId: number; rowIndex: number; columnIndex: number };
            rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
          };
        }[];
        const writes = requests.flatMap((r) =>
          r.updateCells?.start.sheetId === 0 ? [r.updateCells] : [],
        );
        expect(writes).toHaveLength(1);
        expect(writes[0]!.start).toMatchObject({
          rowIndex: 7,
          columnIndex: column - 1,
        });
        expect(writes[0]!.rows[0]!.values[0]!.userEnteredValue).toEqual({
          stringValue: value,
        });
      }
      expect(snapshot.values).toEqual(before);
      const fields = layoutFor(8).steps.flatMap((s) => s.fields);
      expect(fields.find((f) => f.column === 36)!.validationOptions).toEqual([
        'Material In Stock',
      ]);
      expect(fields.find((f) => f.column === 65)!.validationOptions).toEqual([
        'Yard Material',
        'Branch-specific stock',
      ]);
    },
  );
  it('formats only explicit ISO planned/actual values using Sheet timezone without recalculating delays', () => {
    expect(
      workflowDisplayValue(
        'Actual G',
        '2026-05-21T18:58:37.000Z',
        'Asia/Calcutta',
      ),
    ).toMatch(/22 May 2026.*12:28 am/i);
    expect(
      workflowDisplayValue(
        'Time Delay',
        '2026-05-21T18:58:37.000Z',
        'Asia/Calcutta',
      ),
    ).toBe('2026-05-21T18:58:37.000Z');
    expect(
      workflowDisplayValue('Planned D', '21/05/2026 6:58 PM', 'Asia/Calcutta'),
    ).toBe('21/05/2026 6:58 PM');
  });
});
