import { describe, it, expect } from 'vitest';
import { quotationHtml } from './quotation.js';
describe('editable quotation terms', () => {
  it('renders the edited terms, closing message and signature exactly once and escapes HTML', () => {
    const html = quotationHtml({
      company: 'D.M. Metalloys Pvt. Ltd.',
      companyAddress: '',
      companyGstin: '',
      enquiry: 'C/1/26-27',
      date: '2026-10-07',
      customer: 'Example',
      address: '',
      gstin: '',
      purchaser: '',
      branch: 'FBD',
      rows: [],
      terms: {
        NOTE: '<script>alert(1)</script>',
        Payment: '30 days',
        Delivery: '7 days',
        Validity: '2 Days',
        'Closing message': 'Please confirm receipt',
        'Sign-off': 'Regards,',
        'Prepared by': 'Approved salesperson',
      },
      notes: '',
    });
    expect(html).toContain('30 days');
    expect(html).toContain('7 days');
    expect(html).toContain('2 Days');
    expect(html).toContain(
      'Please confirm receipt<br>Regards,<br>Approved salesperson',
    );
    expect(html.match(/Approved salesperson/g)).toHaveLength(1);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('border-bottom:.6pt');
  });
});
