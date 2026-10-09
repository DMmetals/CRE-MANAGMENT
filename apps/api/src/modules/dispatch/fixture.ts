import { stepsFixture } from '../o2d/steps-fixture.js';
import { mapO2DRows } from '../o2d/repository.js';
import { DispatchOrderService } from './service.js';
import { parseEnv } from '../../config/env.js';
import type { O2DBranch } from '@cre/shared';
export function dispatchFixture(branch: O2DBranch = 'FBD') {
  const f = stepsFixture(branch);
  const set = (sr: number, header: string, value: string) => {
    const c = f.snapshot.headerMap.requireColumn(header);
    f.snapshot.values[sr + 5]![c] = value;
    f.snapshot.formulas[sr + 5]![c] = value;
    f.snapshot.rows = mapO2DRows(f.snapshot);
  };
  for (const sr of [1, 2, 3])
    for (const [h, v] of Object.entries({
      'Status PR': 'Approved',
      'Order Qty': String(sr * 100.5),
      'Order Rate': '120.25',
      'Customer Name': 'A2z Filtration',
      THK: '1.2',
      Width: '1250',
      Lgt: '2500',
      Finish: '2B',
      Grade: '304',
      'Lot NO.': `LOT-${sr}\nLOT-${sr}B`,
      Nos: '10',
      'Payment Terms': '100% Advance',
      'PO No': 'PO/380',
    }))
      if (f.snapshot.headerMap.findColumn(h) !== undefined) set(sr, h, v);
  const env = parseEnv({
    NODE_ENV: 'test',
    ENABLE_SHEET_WRITES: 'true',
    DISPATCH_PDF_FOLDER_ID: 'configured-folder',
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'sender',
    SMTP_PASSWORD: 'test-placeholder',
    DISPATCH_EMAIL_FROM: 'sender@example.test',
  });
  const masters = {
    party: async () => ({
      party: {
        billToName: 'A2z Filtration',
        billToAddress: 'Bill address from master',
        billGSTIN: '06EXAMPLE0000X1Z0',
        shipToName: 'A2z Filtration',
        shipToAddress: 'Ship address from master',
        shipGSTIN: '06EXAMPLE0000X1Z0',
        email: 'buyer@example.test',
      },
      warnings: [],
    }),
    transporters: async () => ({
      rows: [{ name: 'Example Transport', gstin: '06TRANSPORT00000' }],
      warnings: [],
    }),
  };
  return {
    ...f,
    set,
    env,
    masters,
    service: () =>
      new DispatchOrderService(
        env,
        {
          load: async () => f.snapshot,
          steps: async (_s, r) => f.layoutFor(r),
          commit: async () => {},
        },
        masters,
      ),
  };
}
