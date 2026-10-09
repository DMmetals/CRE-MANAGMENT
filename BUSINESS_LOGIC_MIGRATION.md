# Business logic migration - verification pending

No legacy-reference directory was found in CRRNBD or the original dm_metal_internal workspace on 2026-10-07. No old function names or behavior have been verified. The mappings below are proposed destinations from the supplied requirements, NOT discoveries from legacy code. No business write logic has been implemented.

| Old function | Responsibility from requirements | Proposed destination | Verification needed |
|---|---|---|---|
| Unavailable | CRR/NBD configuration and headers | GoogleSheetsEnquiryRepository / source config | Legacy constants and live headers |
| Unavailable | Prefix/FY max + 1 numbering under lock | EnquirySequenceService | Legacy numbering, business timezone; Sheets has no compare-and-swap lock |
| Unavailable | Latest customer information | CustomerService / CustomerRepository | Source and latest-record rule |
| Unavailable | SKU first four parts; remaining grade | SkuParser / FormulaProtectionService | Legacy parser, array-formula ranges |
| Unavailable | DM/MM quotation and rates | QuotationService / QuotationRepository | Templates, GSTIN, terms, row matching |
| Unavailable | Quotation PDF, Drive URL and rate writeback | PdfService / GoogleDriveService / EnquiryRepository | Folder, account access, exact DB_ID matching |
| Unavailable | Won + PO + Remarks eligibility | OrderConfirmationService | Legacy eligibility vs revised requirements |
| Unavailable | Branch routing and O2D fields | O2DService / GoogleSheetsO2DRepository | Actual tabs and headers |
| Unavailable | Same Enquiry No; sequential Sr No per enquiry | O2DSequenceService | User correction: no Order No generated |
| Unavailable | Duplicate transfer protection | O2DTransferService | Exact legacy duplicate signature |
| Unavailable | Dispatch approvals and selected Order/Sr rows | DispatchService | Approval rules and same-customer constraint |
| Unavailable | Bill To / Ship To from New Party Addition | PartyRepository | Exact party source and mapping |
| Unavailable | TRASPORTER NAME / GSTIN | TransporterRepository | Headers; A/B only as verified fallback |
| Unavailable | Dispatch A4 PDF and Drive storage | DispatchPdfService / GoogleDriveService | Company fields and existing layout |
| Unavailable | Dispatch URL only to Enquiry No + Sr No | O2DRepository | Link header and stable row identities |
| Unavailable | DB_ID / LAST_EDIT_TS and audit | ConcurrencyService / AuditService | Legacy edits and timestamp maintenance |

## Gate before Phase 2
Provide legacy-reference files and service-account credentials. Verify four spreadsheets through GET /api/meta/sheets. Record actual tab names and headers in DATA_DICTIONARY.md, compare to legacy code, and resolve discrepancies before proceeding. No Google data was modified.

## Live verification update

All four spreadsheets are now accessible with the supplied service-account JSON key. CRR/NBD use FMS row 7; O2D uses FBD/MUM row 6. See DATA_DICTIONARY.md and docs/sheet-metadata.json for verified headers and ambiguities. Legacy function mapping remains blocked by missing legacy-reference files. No Sheet writes were made.

## Supplied-rules implementation authorized
The user authorized implementation from the supplied rules despite missing legacy files. Live read-only CRM and local-development enquiry creation are now implemented. Creation inserts new rows, copies only formatting/validation, leaves auto/derived columns untouched, and refuses writes to any manual field with existing formulas in that column. Customer master values are used for display; auto columns remain Sheet-managed. A single atomic Sheets batch inserts material rows and appends the audit events.

Creation uses an exclusive filesystem lock across processes on the same host. Multi-host deployments are not supported until distributed locking and real authentication are implemented. External Sheet/Apps Script writers do not share the lock. A crashed process may leave runtime/locks/enquiry-create.lock; remove it only after confirming no save is running and checking the prior submission. Retrying the same requestId uses deterministic UUID material identities to avoid duplication. Production writes are denied. Development writes require loopback and DEV_AUTH_BYPASS=true.

### Verified timestamp template exception
Live read-only inspection found the exact per-row circular timestamp template `=if(Cn<>"",if(Un="",NOW(),Un),"")` in unused rows of both FMS tabs. Creation inserts new blank rows ahead of these templates and assigns server timestamps only to the new cells. The existing formula rows are shifted intact. The preflight permits only that verified template in the timestamp column; array or other unknown timestamp formulas still block creation.
