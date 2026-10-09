import type { O2DSnapshot } from './repository.js';
export interface O2DAuditEntry {
  action: string;
  enquiryNo: string;
  srNo: string;
  field: string;
  oldValue: string;
  newValue: string;
}
export function o2dAuditRequests(
  snapshot: O2DSnapshot,
  entries: O2DAuditEntry[],
  actor = 'local-development-user',
) {
  if (!entries.length) return [];
  const existing = snapshot.sheets.find((s) => s.title === 'CRE Audit Log');
  const id =
    existing?.sheetId ?? Math.max(...snapshot.sheets.map((s) => s.sheetId)) + 1;
  const headers = [
    'timestamp',
    'user',
    'action',
    'record',
    'field',
    'oldValue',
    'newValue',
    'branch',
    'enquiryNo',
    'srNo',
  ];
  const timestamp = new Date().toISOString();
  const rows = entries.map((e) => [
    timestamp,
    actor,
    e.action,
    `${e.enquiryNo}|${e.srNo}`,
    e.field,
    e.oldValue,
    e.newValue,
    snapshot.branch,
    e.enquiryNo,
    e.srNo,
  ]);
  return [
    ...(!existing
      ? [{ addSheet: { properties: { sheetId: id, title: 'CRE Audit Log' } } }]
      : []),
    {
      updateCells: {
        start: { sheetId: id, rowIndex: 0, columnIndex: existing ? 7 : 0 },
        rows: [
          {
            values: (existing ? headers.slice(7) : headers).map((value) => ({
              userEnteredValue: { stringValue: value },
            })),
          },
        ],
        fields: 'userEnteredValue',
      },
    },
    {
      appendCells: {
        sheetId: id,
        rows: rows.map((row) => ({
          values: row.map((value) => ({
            userEnteredValue: { stringValue: value },
          })),
        })),
        fields: 'userEnteredValue',
      },
    },
  ];
}
