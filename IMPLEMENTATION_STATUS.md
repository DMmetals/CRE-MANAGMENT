# CRM implementation status ? 2026-10-07

## Verified working
- Fixed white screen caused by stale Vite prebundle of incompatible TanStack Table. The v8 dependency and forced optimization now agree.
- /crr and /nbd display live Google data (7 and 6 material rows at verification), KPIs, filters, customer view and grouped enquiry details.
- Direct Add Enquiry button, multi-material drawer and server-generated number preview. Existing create API remains guarded by ENABLE_SHEET_WRITES=false.
- Edit Row drawer, manual-field validation, DB_ID resolution, full-row version hash and LAST_EDIT_TS checks, formula skip reporting, atomic per-spreadsheet audit writes.
- Quotation pages for DM/MM: selected enquiry, rates, preview and real backend A4 PDF download. Drive upload and exact DB_ID Rate/Quote Link writeback implemented but not exercised against production.
- /o2d/fbd and /o2d/mum load actual rows (4 and 3 material rows), KPIs and filters. Guarded transfer validates Won/PO/Remarks, branch, enquiry and duplicate signature.
- Dispatch builder route and draft PDF path implement exact Order No/Sr selection and same-customer checking. Usability is blocked until order-number mapping is verified.
- Write routes consistently return SHEET_WRITES_DISABLED before a real write while the flag is false. Read-only PDF endpoints are explicitly allowlisted.

## APIs added or completed
GET /api/enquiries/:type
GET /api/enquiries/:type/next-number
GET /api/enquiries/:type/:enquiryNo
GET /api/customers/:type
GET /api/customers/:type/:customerName
POST /api/enquiries
PATCH /api/enquiries/:type/rows/:dbId
POST /api/enquiries/:type/batch-update
POST /api/quotations/preview
POST /api/quotations/pdf
POST /api/quotations/save
GET /api/o2d/:branch
POST /api/o2d/transfer
POST /api/dispatch/preview
POST /api/dispatch/pdf

Quotation email and dispatch final save currently return explicit configuration-required errors after the write gate. They are not completed workflows.

## Files changed
- apps/web/src/App.tsx, main.tsx, ErrorBoundary.tsx, index.html and Vite configuration
- apps/web/src/features/enquiries/: register toolbar, EditRow, CreateEnquiry preview, detail actions and tests
- apps/web/src/features/documents/: QuotationPage and DispatchPage
- apps/web/src/features/o2d/O2DPage.tsx
- apps/api/src/modules/enquiries/: read APIs, update service, creation guard, row versioning
- apps/api/src/modules/google/sheets.ts
- apps/api/src/modules/documents/: PDF, Drive upload, quotation save and route modules
- apps/api/src/modules/o2d/: read service and transfer
- apps/api/src/app.ts, config/env.ts, tests, shared types, package manifests/lockfile
- .env.example, ignored .env, .gitignore, README.md

## Validation
npm.cmd run typecheck: passed
npm.cmd run lint: passed
npm.cmd run test: 24 tests passed
npm.cmd run build: passed (non-fatal upstream Zod annotation and bundle-size warnings)
Headless Edge: CRR Add Enquiry drawer opens, NBD/quotation/O2D/dispatch routes render, quotation preview iframe renders, no page errors.
Live API: health, Google health, CRR/NBD and both O2D GETs HTTP 200.
Quotation preview HTTP 200; PDF HTTP 200/application-pdf, 51,764 bytes in smoke test.
Live POST /api/enquiries returned 403 SHEET_WRITES_DISABLED. No production test records, Drive uploads or emails were created.

## Remaining work / constraints
- Verify blank O2D order-number header mapping. O2D_ORDER_NUMBER_COLUMN is explicit, 1-based, 0 by default; never guessed. Numeric order sequence is supported; other formats fail closed.
- Supply DM/MM company name/address/GSTIN. Final quotation issuing is blocked without them. Provided Drive folder configured: 1keO8Mn4_mymfYiIVPSn8YEcn6LbaGjZ4. Actual upload permission/quota has not been tested.
- Email sender/transport not configured or implemented. No email sent.
- Dispatch approvals, party mapping and transporter master not supplied. Final dispatch save/link writeback remains unfinished; draft builder must not be treated as approved dispatch.
- Historical rows missing DB_ID require an explicit identity migration before edits or quotation saves. No bulk migration performed.
- New material IDs currently use deterministic UUID-form identifiers for idempotent submissions, rather than randomUUID per row. Request IDs use randomUUID. A durable idempotency journal is needed before switching material IDs to random UUIDs.
- Same-host locking only; no distributed lock. External Sheets edits can race read/write. Production authentication and roles remain unfinished; do not deploy as a production-ready multi-user system yet.
- O2D editing, dispatch auto-fill/master integration, email, Save All UI and optimistic rollback are not implemented.
- Graphify CLI is not installed; no graph update was possible in earlier checks.

## Run
From C:\Users\user\Desktop\CRRNBD:

```powershell
npm.cmd run dev
```

Open http://127.0.0.1:5173/crr (or /nbd).
Keep ENABLE_SHEET_WRITES=false until ready to perform real saves. Set true explicitly and restart only when the relevant workflow configuration is verified.


## 7 October 2026: enquiry master and transfer corrections

- Customers: GET /api/customers/:type reads the corresponding New Party addition column A, trims, removes blank/duplicate names and sorts. Customer detail uses master headers. Both live endpoints returned 4,972 names.
- Sales: GET /api/meta/sales-persons/:type reads FMS validation; both live sources returned 10 options from sheet-validation. The supplied ten-name list is the centralized fallback.
- Creation and editing use constrained customer/sales/branch/edge/mode controls. Enquiry mode accepts only Whatsapp or Mail on the server.
- Transfer requires positive FMS Order Qty and a valid Rate. It no longer substitutes enquiry Qty or zero. Balance Qty starts at Order Qty. Dimensions use FMS THK/WIDTH/LGT/FINISH/GRADE; PO Date uses FMS Order Date. Nos is left blank; Total Value is not written. No legacy Qty fallback has been verified.
- Metadata identifies W as Order Receiving Date & Time. O2D now displays dimensions, PO date, balance and receiving time.
- Quotation requests include SKU and LAST_EDIT_TS; saving matches DB_ID + Enquiry No + SKU and rejects changed timestamps before upload.
- Typecheck, lint, 26 tests and production build pass. Build has a nonblocking bundle-size warning. Read-only live customer/sales/FBD endpoints returned HTTP 200. No live data was written.
- Live writes remain disabled. In C:/Users/user/Desktop/CRRNBD/.env set ENABLE_SHEET_WRITES=true only when ready to save actual records, then restart the API. Run npm.cmd run dev from that folder after stopping existing development terminals; if the web server is already running, run npm.cmd run dev:api only.
- Outstanding: the blank O2D Order No column still needs verified mapping; DM/MM legal company details and sender mailbox are missing; dispatch approval rules are unverified. Final dispatch saving/email and O2D editing remain incomplete. The application is not yet production-ready.
