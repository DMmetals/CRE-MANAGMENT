import type { O2DBranch } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { SheetsService } from '../google/sheets.js';
import { customers } from '../customers/service.js';
import { BusinessError } from '../enquiries/creation.js';
import { orderSource } from '../o2d/config.js';
import { normalizeO2DHeader as norm } from '../o2d/headers.js';
export interface DispatchParty {
  billToName: string;
  billToAddress: string;
  billGSTIN: string;
  shipToName: string;
  shipToAddress: string;
  shipGSTIN: string;
  email: string;
}
export function dispatchPartyRecords(
  rows: string[][],
  customer: string,
): DispatchParty | null {
  const headers = (rows[0] ?? []).map(norm);
  const name = headers.indexOf('customer name');
  if (name < 0)
    throw new BusinessError(
      409,
      'PARTY_HEADERS',
      'The party master needs a Customer Name header.',
    );
  const matches = rows
    .slice(1)
    .filter((r) => norm(r[name] ?? '') === norm(customer));
  if (!matches.length) return null;
  if (new Set(matches.map((r) => JSON.stringify(r))).size > 1)
    throw new BusinessError(
      409,
      'PARTY_AMBIGUOUS',
      'Multiple different party records match this customer. Correct the master before generating.',
    );
  const row = matches[0]!;
  const get = (...names: string[]) => {
    for (const n of names) {
      const c = headers.indexOf(norm(n));
      if (c >= 0 && row[c]?.trim()) return row[c]!.trim();
    }
    return '';
  };
  // Actual O2D headers pair Bill To / GSTIN and Ship To / GSTIN; keep both distinct.
  const gstAfter = (label: string) => {
    const c = headers.indexOf(label);
    return c >= 0 && headers[c + 1] === 'gstin'
      ? (row[c + 1] ?? '').trim()
      : '';
  };
  return {
    billToName: get('Bill To Name') || customer,
    shipToName: get('Ship To Name') || customer,
    billToAddress: get('Bill To', 'Bill To Address', 'Billing Address'),
    shipToAddress: get('Ship To', 'Ship To Address', 'Shipping Address'),
    billGSTIN: get('Bill To GSTIN', 'Bill GSTIN') || gstAfter('bill to'),
    shipGSTIN: get('Ship To GSTIN', 'Ship GSTIN') || gstAfter('ship to'),
    email: get('Email', 'Email Address'),
  };
}
export function transporterRecords(rows: string[][]) {
  const h = (rows[0] ?? []).map(norm);
  let name = h.findIndex((v) =>
    /^(?:trasporter|traspoter|transporter)(?: name)?$/.test(v),
  );
  const hasHeader = name >= 0;
  if (name < 0) name = 0;
  let gst = h.findIndex((v) => v.includes('gst'));
  if (gst < 0) gst = 1;
  const records = new Map<string, { name: string; gstin: string }>();
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const n = (row[name] ?? '').trim();
    if (!n) continue;
    const value = { name: n, gstin: (row[gst] ?? '').trim() };
    const prior = records.get(norm(n));
    if (prior && prior.gstin !== value.gstin)
      throw new BusinessError(
        409,
        'TRANSPORTER_AMBIGUOUS',
        `Conflicting GSTIN entries for transporter ${n}.`,
      );
    records.set(norm(n), value);
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export class DispatchMasters {
  constructor(
    private env: Env,
    private sheets = new SheetsService(env),
  ) {}
  async party(branch: O2DBranch, enquiryNo: string, customer: string) {
    const id = orderSource(this.env, branch).id;
    const tabs = await this.sheets.sheets(id);
    const tab = tabs.find((t) => norm(t.title) === 'new party addition');
    if (!tab)
      throw new BusinessError(
        409,
        'PARTY_MASTER_MISSING',
        'New Party Addition is missing from this O2D workbook.',
      );
    const found = dispatchPartyRecords(
      await this.sheets.values(id, tab.title),
      customer,
    );
    const party = found ?? {
      billToName: customer,
      shipToName: customer,
      billToAddress: '',
      shipToAddress: '',
      billGSTIN: '',
      shipGSTIN: '',
      email: '',
    };
    const warnings: string[] = [];
    if (!party.billToAddress || !party.shipToAddress) {
      // Reuse the existing CRR/NBD customer lookup and its verified address-in-F rule.
      const type = enquiryNo.startsWith('C/')
        ? 'CRR'
        : enquiryNo.startsWith('N/')
          ? 'NBD'
          : null;
      if (type) {
        const fallback = (await customers(this.env, type)).find(
          (p) => norm(p.customer) === norm(customer),
        );
        if (fallback?.address) {
          party.billToAddress ||= fallback.address;
          party.shipToAddress ||= fallback.address;
          warnings.push(
            'Missing O2D party addresses were filled from the enquiry customer master.',
          );
        }
        party.email ||= fallback?.email ?? '';
      }
    }
    if (!party.billToAddress || !party.shipToAddress)
      warnings.push(
        'The party master has missing addresses. Complete Bill To and Ship To in this document before issuing.',
      );
    return { party, warnings };
  }
  async transporters(branch: O2DBranch) {
    const id =
      this.env[`DISPATCH_${branch}_TRANSPORTER_SPREADSHEET_ID`] ||
      orderSource(this.env, branch).id;
    const requested =
      this.env[`DISPATCH_${branch}_TRANSPORTER_SHEET`] || 'TRASPORTER NAME';
    const tabs = await this.sheets.sheets(id);
    const tab = tabs.find((t) => norm(t.title) === norm(requested));
    if (!tab)
      return {
        rows: [],
        warnings: [
          `The ${branch} transporter master (${requested}) is not configured in the current workbook.`,
        ],
      };
    return {
      rows: transporterRecords(await this.sheets.values(id, tab.title)),
      warnings: [],
    };
  }
}
