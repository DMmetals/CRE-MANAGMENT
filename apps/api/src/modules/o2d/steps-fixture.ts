import type { O2DBranch } from '@cre/shared';
import { O2DHeaderMap } from './headers.js';
import { mapO2DRows } from './repository.js';
import { purchaseFixture } from './purchase-fixture.js';
import { buildStepLayout, type StepGrid } from './steps.js';
/** Isolated fixtures mirror the inspected merged headers; no live data or credentials. */
export function stepsFixture(branch: O2DBranch = 'FBD') {
  const { snapshot } = purchaseFixture(branch);
  const descriptions = [
    [
      5,
      22,
      1,
      'Upload Purchase Order',
      'Priya',
      'Auto from Enquiry to Order',
      '2:00:00',
    ],
    [
      27,
      31,
      2,
      'Order Verification & sign',
      'Priya',
      'Verification',
      '1:00:00',
    ],
    [31, 40, 3, 'Order Approval by sales Person', 'Priya', 'Mail', '1:00:00'],
    [
      40,
      44,
      4,
      'Limit Approval',
      'Dinesh',
      'As per Balance Limit & Payment Cycle',
      '2:00:00',
    ],
    [
      44,
      48,
      5,
      'Order Verification',
      'Ganesh',
      'Compare with Order Copy',
      '1:00:00',
    ],
    [48, 52, 7, 'Materail Status', 'Ganesh', 'Manually', '03:00:00'],
    [
      52,
      56,
      8,
      'Approval For Dispatch',
      'Priya',
      'Based on Order Slip Given by Sagar',
      '3:00:00',
    ],
    [
      56,
      60,
      9,
      'generate Dispatch Order',
      'CRE',
      'Based on Order Slip Given by Sagar',
      '3:00:00',
    ],
    [
      60,
      67,
      branch === 'FBD' ? 10 : 6,
      'Dispatch Planning',
      'Sagar',
      'Check With Stock',
      '3:00:00',
    ],
  ] as const;
  for (let r = 0; r < 5; r++)
    snapshot.values[r] = Array<string>(snapshot.headerMap.columns.length).fill(
      '',
    );
  const merges: NonNullable<StepGrid['sheets'][number]['merges']> = [];
  for (const [start, end, step, title, who, how, sla] of descriptions) {
    [String(`Step ${step}`), title, who, how, sla].forEach((text, r) => {
      snapshot.values[r]![start] = text;
      merges.push({
        startRowIndex: r,
        endRowIndex: r + 1,
        startColumnIndex: start,
        endColumnIndex: end,
      });
    });
  }
  snapshot.values[0]![67] = 'Final Order Status';
  merges.push({
    startRowIndex: 0,
    endRowIndex: 5,
    startColumnIndex: 67,
    endColumnIndex: 70,
  });
  // A repeated invoice Step 9 must not become a second dispatch generation group.
  snapshot.values[0]![70] = 'Step 9';
  merges.push({
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 70,
    endColumnIndex: 77,
  });
  for (let r = 0; r < 6; r++) snapshot.formulas[r] = [...snapshot.values[r]!];
  snapshot.headerMap = new O2DHeaderMap(snapshot.values[5]!);
  snapshot.rows = mapO2DRows(snapshot);
  const options: Record<number, string[]> = {};
  function gridFor(rowNumber = 7): StepGrid {
    const cell = (value: string, raw: string | undefined) => ({
      formattedValue: value,
      effectiveValue: { stringValue: value },
      userEnteredValue: raw?.startsWith('=')
        ? { formulaValue: raw }
        : { stringValue: raw ?? value },
    });
    return {
      sheets: [
        {
          properties: { sheetId: 0 },
          merges,
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: snapshot.values
                .slice(0, 6)
                .map((row, r) => ({
                  values: row.map((v, c) => cell(v, snapshot.formulas[r]?.[c])),
                })),
            },
            {
              startRow: rowNumber - 1,
              startColumn: 0,
              rowData: [
                {
                  values: (
                    snapshot.values[rowNumber - 1] ??
                    snapshot.values[5]!.map(() => '')
                  ).map((v, c) =>
                    cell(v, snapshot.formulas[rowNumber - 1]?.[c]),
                  ),
                },
              ],
            },
          ],
        },
      ],
    };
  }
  const layoutFor = (rowNumber = 7) =>
    buildStepLayout(snapshot, rowNumber, gridFor(rowNumber), options, true);
  return { snapshot, options, gridFor, layoutFor, merges };
}
