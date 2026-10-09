# CRR/NBD transfer diagnosis - 2026-10-08

## Root cause and fix

Both current CRR materials were Won and had PO Number, Remarks, Qty and Rate. Their FMS Order Qty was blank. The old transfer service required Order Qty and rejected them before writing. The required Qty fallback was missing. Their actual branch values were already FBD; branch spelling was not the immediate blocker for these two records.

The service now resolves Order Qty from FMS Order Qty when populated, otherwise FMS Qty. It centrally normalizes branch aliases and filters the eligible material subset. The CRR/NBD register now exposes Transfer to O2D FBD/MUM directly, followed by the existing preview and confirmation.

## Current source and preview results

Live read-only checks; no transfer was submitted during verification. ENABLE_SHEET_WRITES=true. Both previews returned HTTP 200 with eligible=true and empty blockingReasons. The endpoint also accepts only type and enquiryNo, deriving branch from FMS.

| Field                 | C/1/26-27 | C/2/26-27 |
| --------------------- | --------- | --------- |
| Source                | CRR / FMS | CRR / FMS |
| Raw Branch            | FBD       | FBD       |
| Normalized Branch     | FBD       | FBD       |
| Won status            | Won       | Won       |
| PO Number present     | Yes       | Yes       |
| Remarks present       | Yes       | Yes       |
| Qty                   | 5001      | 5000      |
| Order Qty             | Blank     | Blank     |
| Resolved transfer Qty | 5001      | 5000      |
| Rate                  | 120       | 120       |
| Destination           | O2D FBD   | O2D FBD   |
| Eligible              | Yes       | Yes       |
| Blocking reason       | None      | None      |
| Duplicate materials   | 0         | 0         |
| Next Sr no            | 1         | 1         |

Destination spreadsheet: `1f0nOcCu4AaFl0DDzODv_mM8i4YYBaCD9lyixfd-DLyo`, actual tab `FBD`, gid 0, header row 6.

## Mapping and write behavior

- Enquiry No remains the parent identity. Sr no is sequential within that enquiry; no Order No is generated or required.
- Category is CRR/NBD. Destination is chosen from normalized FMS Branch.
- Order Qty receives the resolved quantity. The existing Balance Qty array formula calculates the same starting balance; its cells are preserved. Total Value and planned dispatch formulas are also preserved.
- Nos, unverified PO Date and unverified Payment Terms remain blank. Blank Order Date and Total Qty are not blockers.
- Duplicate signature is Enquiry No + SKU + Edge + resolved Order Qty + PO Number. Already transferred materials are skipped without blocking new ones.
- Writes are enabled, but opening a preview does not transfer anything. The user confirms Transfer, after which success details and Open O2D FBD/MUM are shown. Backend errors are visible in the UI.

## Verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm run test: 166 tests across 23 files passed.
- npm run build: passed; existing nonfatal bundle-size and dependency annotation warnings remain.
- Browser verification: both direct register actions opened HTTP 200 previews with correct quantities, enabled confirmation and no blocking reasons. No JavaScript errors occurred. Each preview was cancelled without submitting a transfer. Screenshot: runtime/verification/crr-transfer-preview.png.
- Regression coverage includes Faridabad + Won + PO/Remarks + blank Order Qty + Qty 5000, branch aliases, incomplete/non-Won material filtering, mismatched destination rejection, quantity precedence, duplicate retries, serial allocation, preserved formulas and writes-disabled confirmation.
- Automated write tests use mocked Sheets repositories. No production Sheet write was made during diagnosis.
