import type { O2DBranch, O2DWorkflow } from '@cre/shared';
import { O2DHeaderMap } from './headers.js';
import { mapO2DRows, type O2DSnapshot } from './repository.js';
import { resolveWorkflowFields, workflowDefaults } from './workflow.js';
/** Isolated in-memory workbook for workflow and upload regression tests. */
export function workflowFixture(branch: O2DBranch = 'FBD') {
  const headers = [
    'Sr no',
    'Enquiry No.',
    'Customer Name',
    'Sales Person',
    'Category',
    'PO Number',
    'PO Date',
    'SKU',
    'Thk',
    'Width',
    'Lgt',
    'Finish',
    'Grade',
    'Edge',
    'Nos',
    'Order Qty',
    'Balance Qty',
    'Order Rate',
    'Total Value',
    'LIMIT',
    'Payment Terms',
    'Order Receiving Date & Time',
    'Planned ',
    'Actual ',
    'PO PHOTO',
    'Rev PO Photo',
    'Time Delay',
    'Planned ',
    'Actual ',
    'Status',
    'Time Delay (Auto)  P',
    'Planned P',
    'Actual P',
    'Terms & Condition',
    'Size & Rate Approval',
    'Material Status',
    'Lot NO.',
    'CRDD',
    'PO Approval Status',
    'Time Delay (Auto) P1',
    'Planned D',
    'Actual D',
    'Status D',
    'Status',
  ];
  const top: string[] = Array(headers.length).fill('');
  top[27] = 'Step 2';
  top[31] = 'Step 3';
  top[40] = 'Step 4';
  const material = (sr: string) => {
    const row = Array<string>(headers.length).fill('');
    row[0] = sr;
    row[1] = 'C/1/26-27';
    row[2] = 'Fixture customer';
    row[7] = `SKU-${sr}`;
    row[15] = '5001';
    row[16] = '5001';
    row[17] = '120';
    row[18] = '708141.6';
    return row;
  };
  const values = [top, [], [], [], [], headers, material('1'), material('2')];
  const formulas = structuredClone(values);
  formulas[5]![16] = '=ARRAYFORMULA(P7:P)';
  formulas[5]![18] = '=ARRAYFORMULA(P7:P*R7:R*1.18)';
  const snapshot: O2DSnapshot = {
    branch,
    source: {
      id: `test-only-${branch}`,
      tab: `Actual ${branch} tab`,
      header: 6,
      sheetId: 0,
      rowCount: 100,
    },
    values,
    formulas,
    headerMap: new O2DHeaderMap(headers),
    rows: [],
    protectedRanges: [],
    sheets: [
      {
        sheetId: 0,
        title: `Actual ${branch} tab`,
        gridProperties: { rowCount: 100 },
      },
    ],
  };
  snapshot.rows = mapO2DRows(snapshot);
  const workflow: O2DWorkflow = {
    fields: resolveWorkflowFields(snapshot),
    dropdowns: structuredClone(workflowDefaults),
    dropdownSources: {
      orderVerification: 'business-rule',
      termsCondition: 'supplied-default',
      sizeRateApproval: 'supplied-default',
      materialStatus: 'supplied-default',
      poApprovalStatus: 'supplied-default',
    },
    warnings: [],
    writesEnabled: true,
    uploadMaxBytes: 10 * 1024 * 1024,
  };
  return { snapshot, workflow };
}
