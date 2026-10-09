# O2D dropdown and step-card update ? 9 October 2026

## 1. Files changed

Production source:

- apps/api/src/modules/o2d/step-dropdowns.ts ? new user-supplied payment, material and remarks fallback lists.
- apps/api/src/modules/o2d/steps.ts ? buildStepLayout dropdown metadata; stepFieldLabel for Verification Status; workflowDisplayValue for ISO Planned/Actual display using the Sheet timezone. Existing value, rawValue, formulas, grouping and physical column mappings remain intact.
- apps/api/src/modules/o2d/headers.ts ? adds Material Status SG to the manual-editable header allowlist when that named column exists. Protection/formula checks remain intact.
- apps/web/src/features/o2d/O2DSelectField.tsx ? new reusable short select/searchable combobox with keyboard, loading, read-only and error states.
- apps/web/src/features/o2d/StepCard.tsx ? uses existing field keys/physical columns with the shared dropdown and compact WHO/HOW/SLA header.
- apps/web/src/features/o2d/o2d.css ? styles scoped to workflow cards and their controls.

Tests:

- apps/api/src/modules/o2d/steps.test.ts
- apps/web/src/features/o2d/O2DSelectField.test.tsx
- apps/web/src/features/o2d/ProcessStatus.test.tsx
- apps/web/src/features/o2d/Purchase.test.tsx

Documentation: this report. Graphify-generated graph/report artifacts are refreshed after the source changes.

Backup comparisons confirm O2DDetail.tsx (including save and refresh), updates.ts, purchase.ts (timestamps), repository.ts and workflow.ts are unchanged. No changes to enquiry/transfer, PDF/Dispatch, quotation, auth, Drive, Sheet formulas or stored values. No API route/contract changes.

## 2. Step 4 options

Status D / AQ: Approved, Hold, Cancelled.

## 3. Step 5 options

Status G / AU: Verified, CANCEL. UI label: Verification Status.

## 4. Step 8 options

Status PR / BC: Approved, Hold, Cancelled.

## 5. Material Status options

Material Status / AJ uses these nine supplied fallbacks:

- Material In Stock
- To Purchase
- Jindal Booking
- Job Work
- POP
- Material In Stock (Mum)
- Yard Material
- Material In Stock DLH
- Material In Stock FBD

Neither current workbook has a named Material Status SG column; BM remains unnamed and hidden. No header or column was inserted. When a named Material Status SG exists, its own validation and physical column are used independently from Material Status. An isolated fixture verifies both fields cannot be mixed.

## 6. Remarks / Challenges options

Remarks/ Challenges / BN uses the 22 supplied fallbacks, preserving spelling/capitalization:

- Hold by DineshJi
- Awaiting for LC
- Awaiting for Customer Confirmation
- Awaiting for Payment
- Hold by Salesperson
- Order cancel by Client
- Awaiting for Jindal Material
- Payment Received
- Awaiting for Amended PO
- Received Jindal material
- Order Short Closed
- Excess Sold with Buyer's Confirmation
- Awaiting Part Load Vehicle
- Awaiting for Customer Vehicle
- Hold By Vikrambhai
- ORDER HOLD BY CUSTOMER
- AWAITING FOR MUMBAI INCOMING MATERIAL
- ORDER NOT BOOK IN JINDAL
- WAITING FOR CUTTER CONFIRMATION
- No Issues ? Proceed
- AWAITING FOR JINDAL YARD MATERIAL
- AWAITING FOR YASH REPLY

## 7. FBD validation check

Read the configured FBD workbook through the existing repository. There is one current material row. No ONE_OF_LIST/ONE_OF_RANGE validation is returned for these requested fields. Metadata therefore reports supplied-default for U, AJ, AQ, AU, BC and BN. The live drawer renders these controls correctly. No live cell was changed during verification.

## 8. MUM validation check

Read the configured MUM workbook independently. It currently has no material rows; validation was checked at its first data row and across the existing configured column ranges. The same requested fields have no returned list validation, so supplied fallbacks are used. MUM dispatch planning retains its existing Sheet Step 6 numbering. Browser and exact-row save tests use an isolated MUM fixture, not fabricated live records.

For both branches, actual Sheet list/range validation remains authoritative, including additional choices. Fallbacks are used only when no list metadata exists. Tests verify different choices per physical column and preserve existing values that are absent from the list. No validation rules were written to Google Sheets.

## 9. UI improvements and Payment Terms

Each existing workflow card keeps its current tab and process title. It now has a clear step badge, compact WHO/HOW/SLA strip, readable muted read-only fields and selected-status colors. Two columns on desktop collapse to one on smaller screens. Planned/Actual values still come from Sheets; explicit ISO values are formatted for display in the Sheet timezone. Time Delay is displayed unchanged, with no recalculation.

Payment Terms / U is a single searchable dropdown. Only the payment section of the supplied image was transcribed. The two repeated entries are deduplicated; Transport options are excluded. The 19 exact options are:

- 60 DAYS
- 30 DAYS
- AGAINST DELIVERY
- AGAINST PERFORMA INVOICE
- 90 DAYS PCD CHEQUE
- 60 DAYS PCD CHEQUE
- 15 DAYS
- 90 DAYS BANK LC
- 60 DAYS PDC BEFORE DISPATCHED
- 7 DAYS
- 30 DAYS PDC CHEQUE
- 45 DAYS BANK LC
- 45 DAYS
- 10 DAYS
- 45 DAYS PDC CHEQUE
- CASH
- 180 Days Bank LC Interest in our scope
- 75 days pdc from date of invoice
- 10% Advance Balance against performa Invoice

Material and remarks controls are also searchable. Typing a search does not dirty the form; only selecting an option changes its mapped value. Existing unlisted values remain visible, blank selection is supported, and Escape closes the list without closing the drawer. The existing Save changes button and refresh flow remain intact.

## 10. Tests passed

- npm.cmd run typecheck ? passed.
- npm.cmd run lint ? passed.
- npm.cmd run test ? 33 files, 255 tests passed.
- Tests cover Sheet-first options, payment-only fallback entries, keyboard/mouse behavior, exact SR2/SKU2 physical-cell writes for each dropdown, untouched neighboring rows, separate Material Status/Material Status SG bindings, existing timestamp preservation, and dirty-only frontend payloads.
- Read-only Edge checks: live FBD desktop/mobile, MUM fixture, no page errors. Searches left Save changes disabled. Google Sheet write requests were inspected in isolated tests; live business data was not edited.

## 11. Build passed

npm.cmd run build passed. Existing non-fatal Zod annotation and bundle-size warnings remain. The existing application is running at http://127.0.0.1:5173/.
