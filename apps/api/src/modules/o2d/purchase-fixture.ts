import type { O2DPurchase } from '@cre/shared';
import { O2DHeaderMap } from './headers.js';
import { mapO2DRows } from './repository.js';
import { purchaseLayout } from './purchase.js';
import { workflowFixture } from './workflow-fixture.js';
/** Three isolated materials; never uses a live Sheet. */
export function purchaseFixture(branch: 'FBD' | 'MUM' = 'FBD') {
  const { snapshot, workflow } = workflowFixture(branch);
  const headers = [
    ...snapshot.values[5]!.slice(0, 40),
    'Planned D',
    'Actual D',
    'Status D',
    'Time Delay (Auto) D',
    'Planned G',
    'Actual G',
    'Status G',
    'Time Delay (Auto) G',
    'Purchase Target Date',
    'Jindal Expected Date',
    'Job Work Expected Date',
    'REVISED CRDD',
    'Planned PR',
    'Actual PR',
    'Status PR',
    'Time Delay (Auto) PR',
    'Planned',
    'Actual',
    'Dispatch Order link',
    'Time Delay',
    'Planned SG',
    'Actual SG',
    'VEHICLE NUMBER',
    'TRASPOTER NAME',
    '',
    'Remarks/ Challenges',
    'Time Delay',
    'Status',
    'Final Status TImestam[p',
    'Move status \n',
    ...Array.from({ length: 10 }, () => [
      'Planned Dispatch Date',
      'Qty Dispatched',
      'Dispatch Date',
      'Invoice No.',
      'Invoice Date',
      'Invoice Value',
      'Invoice Due Date',
    ]).flat(),
  ];
  snapshot.timeZone = 'Asia/Calcutta';
  snapshot.values[5] = headers;
  snapshot.values = snapshot.values.slice(0, 6);
  for (const sr of [1, 2, 3]) {
    const row = Array<string>(headers.length).fill('');
    row[0] = String(sr);
    row[1] = 'C/1/26-27';
    row[2] = 'Same customer';
    row[7] = `SKU-${sr}`;
    row[40] = '08/10/2026 10:00:00';
    row[44] = '08/10/2026 11:00:00';
    row[135] = '09/10/2026'; // EF is an invoice date, not the dispatch link in this workbook.
    snapshot.values.push(row);
  }
  snapshot.formulas = structuredClone(snapshot.values);
  snapshot.formulas[7]![40] = '=A8+2/24';
  snapshot.formulas[7]![43] = '=AP8-AO8';
  snapshot.formulas[7]![44] = '=AP8+1/24';
  snapshot.formulas[7]![47] = '=AT8-AS8';
  snapshot.headerMap = new O2DHeaderMap(headers);
  snapshot.rows = mapO2DRows(snapshot);
  const layout = purchaseLayout(snapshot);
  const settings: O2DPurchase = {
    columns: layout.columns,
    readOnlyColumns: layout.readOnlyColumns,
    dateColumns: layout.dateColumns,
    dropdowns: {
      ...structuredClone(layout.defaultDropdowns),
      43: ['Approved', 'Hold'],
      47: ['Verified', 'Hold'],
    },
    finalStatusColumn: layout.finalStatusColumn,
    dispatchLinkColumn: layout.dispatchLinkColumn,
    writesEnabled: true,
  };
  return { snapshot, workflow, settings };
}
