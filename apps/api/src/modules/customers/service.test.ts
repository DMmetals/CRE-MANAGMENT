import { describe, it, expect } from 'vitest';
import { partyRecords, SALES_PERSON_FALLBACK } from './service.js';
describe('customer master', () => {
  it('uses column A, trims, deduplicates and sorts without fabricating contacts', () => {
    const result = partyRecords([
      ['Customer Name', 'State', "Purchaser's Name"],
      [' Zebra ', 'Delhi', 'Person'],
      ['', 'ignored'],
      ['alpha'],
      ['ZEBRA', 'duplicate'],
    ]);
    expect(result.map((r) => r.customer)).toEqual(['alpha', 'Zebra']);
    expect(result[0]).toMatchObject({
      state: '',
      phone: '',
      email: '',
      branch: '',
    });
    expect(result[1]).toMatchObject({ state: 'Delhi', purchaser: 'Person' });
  });
  it('uses column F for the quotation address even with a conflicting header elsewhere', () => {
    const result = partyRecords([
      [
        'Customer Name',
        'Address',
        'State',
        'Purchaser',
        'Phone',
        'Party address',
      ],
      [
        'Example',
        'Old address',
        '',
        '',
        '',
        '  12 Industrial Road\nDelhi 110001  ',
      ],
      ['No address', 'Do not substitute this value'],
    ]);
    expect(result[0]!.address).toBe('12 Industrial Road\nDelhi 110001');
    expect(result[1]!.address).toBe('');
  });
  it('keeps the supplied sales list centralized', () => {
    expect(SALES_PERSON_FALLBACK).toHaveLength(10);
    expect(SALES_PERSON_FALLBACK).toContain('S.Bhowmick');
  });
});
