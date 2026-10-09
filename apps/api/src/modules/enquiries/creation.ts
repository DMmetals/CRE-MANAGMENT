import { createHash } from 'node:crypto';
import type { CreateEnquiryInput } from '@cre/shared';
import { mapHeaders } from './headers.js';
export class BusinessError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextEnquiryNumber(
  type: 'CRR' | 'NBD',
  numbers: string[],
  date: string,
) {
  const year =
    Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
  const fy = `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  const prefix = type === 'CRR' ? 'C' : 'N';
  const regex = new RegExp(`^${prefix}/(\\d+)/${fy}$`);
  const max = numbers.reduce((n, v) => {
    const found = regex.exec(v.trim());
    return found ? Math.max(n, Number(found[1])) : n;
  }, 0);
  return `${prefix}/${max + 1}/${fy}`;
}
export function materialId(requestId: string, index: number) {
  const hex = createHash('sha256')
    .update(`${requestId}:${index}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function planCreation(
  input: CreateEnquiryInput,
  rows: string[][],
  headerRow: number,
  startRow: number,
  now = new Date(),
) {
  const column = mapHeaders(rows[headerRow - 1] ?? []);
  const names = [
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
  ];
  names.forEach((name) => column(name, true));
  const enquiryColumn = column('Enquiry No.', true)!;
  const idColumn = column('DB_ID', true)!;
  const records = rows.slice(startRow - 1);
  const idSet = new Set(
    input.materials.map((_, index) => materialId(input.requestId, index)),
  );
  const previous = records.filter((row) => idSet.has(row[idColumn] ?? ''));
  if (previous.length) {
    const matches =
      previous.length === input.materials.length &&
      input.materials.every((material, index) => {
        const row = previous.find(
          (r) => r[idColumn] === materialId(input.requestId, index),
        );
        return (
          row &&
          [
            ['Customer Name', input.customerName],
            ['Sales Person', input.salesPerson],
            ['Branch', input.branch],
            ['SKU', material.sku],
            ['Edge', material.edge],
            ['Qty', String(material.qty)],
            ['LIMIT', material.limit],
            ['Enq Mode', material.mode],
            ['Material Type', material.materialType],
          ].every(([key, value]) => String(row[column(key!)!] ?? '') === value)
        );
      });
    if (!matches)
      throw new BusinessError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This submission was already used with different material details. Refresh before creating another enquiry.',
      );
    return {
      replayed: true as const,
      enquiryNo: previous[0]![enquiryColumn]!,
      insertionIndex: 0,
      materials: [],
    };
  }
  const date = businessDate(now);
  const enquiryNo = nextEnquiryNumber(
    input.type,
    records.map((row) => row[enquiryColumn] ?? ''),
    date,
  );
  let insertionIndex = startRow - 1;
  rows.forEach((row, i) => {
    if (i >= startRow - 1 && row[enquiryColumn]?.trim()) insertionIndex = i + 1;
  });
  const materials = input.materials.map((material, index) => {
    const fields: Record<string, string | number> = {
      Date: date,
      'Enquiry No.': enquiryNo,
      'Customer Name': input.customerName,
      'Sales Person': input.salesPerson,
      Branch: input.branch,
      'Material Type': material.materialType,
      SKU: material.sku,
      Edge: material.edge,
      Qty: material.qty,
      LIMIT: material.limit,
      'Enq Mode': material.mode,
      'Enquiry Noted Timestamp (Auto)': now.toISOString(),
      DB_ID: materialId(input.requestId, index),
      LAST_EDIT_TS: now.toISOString(),
    };
    const parts = material.sku.split('-');
    const derived: Record<string, string> = {
      THK: parts[0]!,
      WIDTH: parts[1]!,
      LGT: parts[2]!,
      FINISH: parts[3]!,
      GRADE: parts.slice(4).join('-'),
    };
    for (const [name, value] of Object.entries(derived)) {
      const col = column(name);
      if (
        col !== undefined &&
        !records.some((row) => String(row[col] ?? '').startsWith('='))
      )
        fields[name] = value;
    }
    // Never copy formulas or populate formula-managed derived columns.

    for (const name of Object.keys(fields)) {
      const col = column(name, true)!;
      if (
        records.some((row, index) => {
          const value = String(row[col] ?? '');
          if (!value.startsWith('=')) return false;
          // These verified per-row templates move below the inserted rows; none is overwritten.
          const n = startRow + index;
          const knownTimestamp = `=if(C${n}<>"",if(U${n}="",NOW(),U${n}),"")`;
          return !(
            name === 'Enquiry Noted Timestamp (Auto)' &&
            value.replace(/\s/g, '').toLowerCase() ===
              knownTimestamp.toLowerCase()
          );
        })
      )
        throw new BusinessError(
          409,
          'FORMULA_PROTECTED',
          `Cannot create records: ${name} is formula-managed. Review the Sheet mapping.`,
        );
    }
    return Object.entries(fields).map(([name, value]) => ({
      column: column(name, true)!,
      name,
      value,
    }));
  });
  return { replayed: false as const, enquiryNo, insertionIndex, materials };
}
