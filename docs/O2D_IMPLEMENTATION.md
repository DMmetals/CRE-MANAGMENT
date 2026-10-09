# O2D implementation and verification - 2026-10-08

The implemented flow is CRR/NBD -> explicit Won-material confirmation -> O2D FBD/MUM. The user's latest correction governs identity: retain Enquiry No and allocate Sr no within that enquiry. No Order No is generated, stored, required, or shown.

## Workbook verification

| Check                   | Result                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| FBD actual tab          | FBD, gid=0, header row 6                                                                               |
| MUM actual tab          | MUM, gid=0, header row 6                                                                               |
| FBD headers             | 140 physical columns, A:EJ                                                                             |
| MUM headers             | 140 physical columns, A:EJ                                                                             |
| Differences             | None: all headers, spelling and repeated blocks match                                                  |
| Duplicate headers       | Planned/Actual/Time Delay: 3 each; Status: 2; each of 7 dispatch/invoice headers: 10                   |
| Blank spacer            | BM, preserved                                                                                          |
| Receiving timestamp     | V, Order Receiving Date & Time                                                                         |
| W                       | Planned occurrence 1, preserved                                                                        |
| Formula-managed outputs | Q Balance Qty, S Total Value, BS first Planned Dispatch Date; their header ARRAYFORMULAs are preserved |

Full physical column/header/occurrence/section/business-meaning tables and formula notes are in [O2D_DATA_DICTIONARY.md](O2D_DATA_DICTIONARY.md). Schema metadata only is stored in O2D_SCHEMA_SNAPSHOT.json. The API resolves the actual gid=0 title every read.

## Transfer rules implemented

- Source category is CRR or NBD. The shared normalizeBranch helper normalizes FBD/Faridabad and MUM/Mumbai aliases in the API and UI. The backend derives the destination from eligible FMS rows; a supplied branch must match those rows. Mixed destinations require an explicit branch choice. Category does not select the destination.
- Only materials whose trimmed, case-insensitive status is Won and whose PO Number and Remarks are populated transfer. Incomplete or non-Won materials are skipped without blocking eligible materials for the same enquiry and destination. When no material qualifies, the API returns the specific blocking reason.
- Transfer remains an explicit action. Preview shows destination, enquiry, PO, material count, next serials, duplicates, fields to write, and preserved formulas. Confirmation sends a snapshot token; source/destination changes require a new preview.
- The same Enquiry No is copied to O2D. Existing material serials are checked for valid/unique positive integers; later transfers continue after the maximum for that enquiry.
- Duplicate signature: Enquiry No + SKU + Edge + Order Qty + PO Number. Existing and repeated-in-request duplicates are skipped and counted.
- Initial business fields: Sr no, Enquiry No., Customer Name, Sales Person, Category, PO Number, SKU, Thk, Width, Lgt, Finish, Grade, Edge, Order Qty, Order Rate, LIMIT, backend receiving timestamp. Balance Qty is initialized only when not formula-managed; the live Q formula calculates the initial balance.
- Nos stays blank. Total Value stays Sheet-managed. Remarks is an eligibility condition, not a destination write. PO Date and Payment Terms stay blank because no verified legacy mapping is available. No source FMS Sent/Order ID/Order Date/Sr no writebacks are invented.
- Rate comes from FMS Rate saved by quotation. FMS Order Qty is used when populated; otherwise FMS Qty is used, as explicitly required on 2026-10-08. The resolved quantity must be positive. Invalid nonblank Order Qty is rejected. Blank Order Date and Total Qty do not block transfer.
- Writes use one atomic Sheets batch for the selected cells, any necessary row capacity expansion, and audit records. Individual cell values use stringValue/numberValue rather than formula interpretation.
- The existing filesystem write lock serializes app writes and Sr allocation across processes on this host. The service rereads source and destination before committing. External Sheet editors do not share this lock; multiple backend hosts require a shared locking design. Uncertain batch results are not automatically retried; a new preview checks existing duplicates.
- Formula protection includes individual formulas, array-output columns including header anchors, and Sheets protected ranges. Editing returns protectedFields and never targets formula output cells.

## APIs

All responses use the existing success/error envelope. Branches accept lowercase or uppercase.

- GET /api/o2d/fbd and GET /api/o2d/mum (optional enquiryNo/category filters)
- GET /api/o2d/:branch/meta
- GET /api/o2d/:branch/enquiries/:enquiryNo
- GET /api/o2d/:branch/activity?enquiryNo=...&srNo=...
- POST /api/o2d/transfer/preview
- POST /api/o2d/transfer
- PATCH /api/o2d/:branch/rows/:rowId
- POST /api/o2d/:branch/batch-update

Transfer payload: {type, enquiryNo, branch?, previewToken?}. Results include eligible, normalizedBranch, destination, spreadsheetId, sheetName, writesEnabled, materials (raw branch, status, PO/Remarks presence and quantity resolution), duplicates, blockingReasons, enquiryNo, srNos, transferred, skippedDuplicates, rowsToInsert, protectedFields and previewToken. Preview business errors return eligible=false and blockingReasons in the error envelope data. Preview remains read-only when writes are disabled; the UI explains the disabled confirmation. Row updates include id (batch only), enquiryNo, srNo, version and changes[{column,value}] with 1-based physical columns.

## UI

- The existing CRR/NBD register now includes a direct Transfer to O2D FBD/MUM action on eligible material rows, using the existing table design. The detail action remains available, with missing-PO/Remarks messages, preview/confirmation, success counts and persistent transfer status from real destination rows.
- Open O2D uses /o2d/fbd?enquiry=... or /o2d/mum?enquiry=....
- Both registers load live Sheets, show four KPIs, search and category/sales/customer/final-status filters. Total orders means unique enquiry numbers.
- Main fields are grouped into Order, Order processing, Purchase and Dispatch. Row detail has Overview, Process Status, Purchase, Dispatch, Invoice History and Activity tabs.
- Repeated invoice blocks are kept out of the main table. Manual workflow fields can be edited; identity/source-owned and formula fields remain read-only.
- Activity reads actual CRE Audit Log entries and existing Sheet timestamps.
- Dispatch draft selection was corrected to Enquiry No + selected Sr no, with same-customer validation. Issued dispatch PDF saving/link writeback remains the separate existing approval/configuration-dependent feature; this change does not fabricate approval rules or claim dispatch issuing is complete.

## Verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm run test: 166 tests across 23 files passed. All transfer/write tests use isolated fixtures and mocked repositories, never production Sheets. Write-disabled paths are tested; synthetic enabled-write cases verify batch contents only.
- npm run build: passed. Existing nonfatal Vite bundle-size and dependency annotation warnings remain.
- Read-only live API: both registers and metadata return 200; 140 columns each; formula columns 17,19,71. At verification both O2D registers had zero material rows.
- Google Drive status remains ready; the existing authentication was not changed.
- Browser: both live O2D pages render; enquiry-based dispatch selection is present; no JavaScript errors on the checked pages.
- Both current Won CRR enquiries now pass the real read-only transfer preview: C/1/26-27 resolves Qty 5001 and C/2/26-27 resolves Qty 5000 into Order Qty, with FBD destinations and no blockers. The previous missing fallback was the cause of their rejection. Full diagnostics are in [O2D_TRANSFER_DIAGNOSTICS.md](O2D_TRANSFER_DIAGNOSTICS.md).
- ENABLE_SHEET_WRITES is currently true, as previously configured by the user. No live transfer or destructive write test was performed.
- Active CRR remains the previously supplied replacement spreadsheet 1bP0E2-G9VTFR_Lq2SCIKvc1UBdANQNT6J48BFn1WmgQ; the pasted older source ID was not substituted silently.
