import type { O2DColumn } from '@cre/shared';
import { BusinessError } from '../enquiries/creation.js';
import { columnName } from '../enquiries/headers.js';
export function normalizeO2DHeader(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
const invoiceHeaders = [
  'Planned Dispatch Date',
  'Qty Dispatched',
  'Dispatch Date',
  'Invoice No.',
  'Invoice Date',
  'Invoice Value',
  'Invoice Due Date',
];
export class O2DHeaderMap {
  readonly columns: O2DColumn[];
  readonly duplicateHeaders: {
    header: string;
    columns: number[];
    occurrences: number;
  }[];
  private indices = new Map<string, number[]>();
  constructor(headers: string[]) {
    const starts = ['Planned D', 'Planned', 'Planned Dispatch Date'].map((n) =>
      headers.findIndex((h) => normalizeO2DHeader(h) === normalizeO2DHeader(n)),
    );
    const purchaseStart = starts[0];
    const dispatchStart =
      headers.findIndex(
        (h) => normalizeO2DHeader(h) === 'dispatch order link',
      ) - 2;
    const invoiceStart = starts[2];
    const processingStart = headers.findIndex(
      (h) => normalizeO2DHeader(h) === 'payment terms',
    );
    this.columns = headers.map((header, index) => {
      const key = normalizeO2DHeader(header);
      const positions = this.indices.get(key) ?? [];
      positions.push(index);
      this.indices.set(key, positions);
      let section = 'Order';
      if (processingStart >= 0 && index >= processingStart)
        section = 'Order processing';
      if (
        purchaseStart !== undefined &&
        purchaseStart >= 0 &&
        index >= purchaseStart
      )
        section = 'Purchase';
      if (dispatchStart >= 0 && index >= dispatchStart) section = 'Dispatch';
      if (
        invoiceStart !== undefined &&
        invoiceStart >= 0 &&
        index >= invoiceStart
      )
        section = `Invoice ${Math.floor((index - invoiceStart) / invoiceHeaders.length) + 1}`;
      return {
        column: index + 1,
        letter: columnName(index),
        header,
        occurrence: positions.length,
        section,
        meaning: key
          ? `${header.trim()} (${section.toLowerCase()})`
          : 'Unnamed spacer; never written by this application',
      };
    });
    this.duplicateHeaders = [...this.indices.entries()]
      .filter(([key, indices]) => key && indices.length > 1)
      .map(([, indices]) => ({
        header: headers[indices[0]!]!.trim(),
        columns: indices.map((i) => i + 1),
        occurrences: indices.length,
      }));
    if (invoiceStart !== undefined && invoiceStart >= 0) {
      if ((headers.length - invoiceStart) % invoiceHeaders.length !== 0)
        throw new BusinessError(
          409,
          'O2D_HEADER_LAYOUT_CHANGED',
          'The final invoice block is incomplete. Review its mapping before editing.',
        );
      for (let i = invoiceStart; i < headers.length; i++) {
        if (
          normalizeO2DHeader(headers[i]!) !==
          normalizeO2DHeader(invoiceHeaders[(i - invoiceStart) % 7]!)
        )
          throw new BusinessError(
            409,
            'O2D_HEADER_LAYOUT_CHANGED',
            `Invoice section header changed at ${columnName(i)}. Review its mapping before editing.`,
          );
      }
    }
  }
  findColumn(
    name: string,
    occurrence?: number,
    section?: string,
  ): number | undefined {
    let indices = this.indices.get(normalizeO2DHeader(name)) ?? [];
    if (section)
      indices = indices.filter((i) => this.columns[i]!.section === section);
    if (occurrence !== undefined) {
      if (!Number.isInteger(occurrence) || occurrence < 1)
        throw new BusinessError(
          400,
          'INVALID_OCCURRENCE',
          'Header occurrence must be a positive integer.',
        );
      return indices[occurrence - 1];
    }
    if (indices.length > 1)
      throw new BusinessError(
        409,
        'O2D_AMBIGUOUS_HEADER',
        `Header ${name} occurs ${indices.length} times. Specify its occurrence or section.`,
      );
    return indices[0];
  }
  requireColumn(name: string, occurrence?: number, section?: string): number {
    const value = this.findColumn(name, occurrence, section);
    if (value === undefined)
      throw new BusinessError(
        409,
        'O2D_HEADER_MISSING',
        `Required O2D header is missing: ${name}.`,
      );
    return value;
  }
}
const editable = new Set(
  [
    'Nos',
    'PO Date',
    'Payment Terms',
    'Terms & Condition',
    'Size & Rate Approval',
    'Material Status',
    'Material Status SG',
    'Lot NO.',
    'CRDD',
    'PO Approval Status',
    'Status D',
    'Status G',
    'Purchase Target Date',
    'Jindal Expected Date',
    'Job Work Expected Date',
    'REVISED CRDD',
    'Status PR',
    'VEHICLE NUMBER',
    'TRASPOTER NAME',
    'Remarks/ Challenges',
    'Status',
    'Move status',
    'Planned Dispatch Date',
    'Qty Dispatched',
    'Dispatch Date',
    'Invoice No.',
    'Invoice Date',
    'Invoice Value',
    'Invoice Due Date',
    'Planned',
    'Actual',
    'Planned P',
    'Actual P',
  ].map(normalizeO2DHeader),
);
export function isBusinessEditable(header: string) {
  return editable.has(normalizeO2DHeader(header));
}
