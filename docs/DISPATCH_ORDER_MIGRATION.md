# Dispatch Order migration

Implemented in the existing CRRNBD project on 9 October 2026. This replaces the prior simple Dispatch draft and the disabled Step 9 action; it supersedes the Dispatch integration limitation in O2D_SHEET_WORKFLOW.md.

## Verified legacy references

No legacy-reference directory exists in this checkout. The migration uses the existing local files:

- `C:/Users/user/Downloads/Dispatch_Order_Code_UPDATED.gs`: buildDispatchOrderHtmlData, _doHtmlLookupParty_, _doHtmlCalcSummary_, _doHtmlBuildPdfHtml_, PDF saving and email functions.
- `C:/Users/user/Downloads/Dispatch_Order_2091_2026-10-05_113529.pdf`: current FBD layout, GSTIN, address, bank and transporter blocks.
- `C:/Users/user/Downloads/Dispatch_Order_48_2026-07-28_122059.pdf`: MUM GSTIN and actual Navi Mumbai dispatch address.

The legacy PDF HTML is embedded in the `.gs` file and was migrated into template.ts. Its separate DispatchOrderHtmlDialog file was not found. The older `.gs` COMPANY object incorrectly carries Faridabad dispatch text for its MUM tab; the verified MUM PDF address is used instead. No legacy spreadsheet or Drive folder ID was adopted.

## Identity, eligibility and mapping

All new selection is branch + Enquiry No. + Sr no. No Sales Order No. is read, generated or matched. Duplicate serials, missing/nonunique matches, mixed customers and stale versions are rejected. Enquiry choices include only enquiries containing Approved materials. Step 9 opens `/dispatch/fbd` or `/dispatch/mum` with the enquiry and current Sr preselected when eligible.

| Dispatch field                          | Current source                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval                                | Step 8 mapped Status PR, matched by header within merged workflow metadata; must equal Approved (trimmed, case-insensitive)                                  |
| PDF link                                | Step 9 mapped Dispatch Order link; currently BG in both workbooks                                                                                            |
| Qty (Kgs)                               | Order Qty, matching legacy COL_QTY = 17 / Q; not Balance Qty or Qty Dispatched                                                                               |
| Unit price                              | Order Rate                                                                                                                                                   |
| Lot / grade / finish / dimensions / Nos | Existing O2D Lot NO., Grade, Finish, THK, Width, Lgt, Nos mappings                                                                                           |
| Terms of Payment                        | Unique selected O2D Payment Terms joined with comma-space                                                                                                    |
| PO / Ref No                             | Unique selected PO Number values joined with comma-space                                                                                                     |
| Vehicle Number                          | Existing selected Step 10 vehicle values, editable in document only                                                                                          |
| Loading                                 | Sum a uniquely named Loading / Loading Charges / Pkg. & Loading Charges field if present; current Sheets have none, so editable document value defaults to 0 |
| Other Charges                           | Editable document value, default 0                                                                                                                           |
| Terms of Delivery                       | Destination, editable in document                                                                                                                            |

Only selected Dispatch Order link cells are updated, together with audit entries in the separate audit sheet. No whole row/column rewrite, no EF/EG legacy writes, no Step 9 Actual write and no formula writes. This follows the latest request to update only the link. Formula/protection and identity checks run before PDF upload and again before link commit. Row positions are resolved again, so unselected Srs remain untouched.

## Branch company configuration

| Field            | FBD                                                                                        | MUM                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Company          | D.M. Metalloys Pvt. Ltd.                                                                   | D.M. Metalloys Pvt. Ltd.                                                  |
| Batch            | FARIDABAD                                                                                  | MAHARASHTRA                                                               |
| GSTIN            | 06AADCD4951F1ZU                                                                            | 27AADCD4951F1ZQ                                                           |
| Dispatch address | PROPERTY NO 688, Faridabad, SECTOR 59, LOHA MANDI URBAN ESTATE, FARIDABAD 121001 (Haryana) | DM Address: Plot no 1439, KCW, Kalamboli steel market, Navi Mumbai 410218 |

HO: 27, Gurjar Building, Office No. 1, Sadashiv Cross Lane, Girgaum, Mumbai - 400004. Contact and bank details are preserved from the sample: STATE BANK OF INDIA, account 36998510522, GIRGAON, account name M/s. D. M. Metalloys Pvt. Ltd. Central defaults live in config.ts; branch GSTIN/address overrides and GST rate are in `.env.example`. Existing DM company name/HO overrides are reused. GST rate defaults to 18.

## Party and transporter masters

Each current O2D workbook has New Party Addition with these inspected columns:

A Customer Name; B State; C Bill To; D GSTIN; E Ship To; F GSTIN; G Email; H Contact NO.; I Name Of Person.

The new dispatch adapter maps headers and preserves each GSTIN's association with its adjacent Bill To or Ship To column. It detects conflicting duplicate customer records. It does not use the enquiry quotation address-in-F rule on this different master. If O2D addresses are missing, it reuses the existing CRR/NBD `customers()` repository as a fallback. Document-only address edits never change either master.

Neither current O2D workbook contains TRASPORTER NAME. The dropdown/GST lookup is implemented with header mapping and legacy A/B fallback, but requires the current master location. Configure `DISPATCH_FBD_TRANSPORTER_SPREADSHEET_ID` / `DISPATCH_MUM_TRANSPORTER_SPREADSHEET_ID` and corresponding `_SHEET` values. If no workbook override is set, the current branch O2D workbook is used. Never supply a legacy workbook merely because it was in Apps Script. Transporter GSTIN is read-only and resolved on the server; the client cannot override it.

## Single document, calculations and output

DispatchOrderService.buildDocument is used by preview, PDF download, save and email. The typed DispatchOrderDocument and lines carry source values and decimal-string totals. Decimal.js calculates line qty * rate, rounded half-up to 2 currency decimals; displayed line totals are summed. Other/loading charges are rounded to 2 decimals, taxable = goods + other + loading, GST = taxable * rate / 100, rounded half-up, grand total = taxable + GST. Zero GST remains zero. Fractional quantities are retained (up to 3 decimals displayed in PDF). No React totals calculation competes with the server.

One HTML template is used for both the sandboxed browser preview and Puppeteer PDF. It preserves the orange stripe, centered underlined company name, blue Dispatch heading, order/party/bank/transport blocks, ten material columns, totals, legacy terms and footer. The identity caption is now Enquiry No. Lot line breaks are retained and all editable text is HTML-escaped.

Dates and filenames use the Sheet timezone. Filenames are Dispatch_Order_{sanitized enquiry}_{yyyy-MM-dd_HHmmss}.pdf. Preview/download do not upload a file or update business Sheets. The UI requires a refreshed preview after draft edits; the server checks its fingerprint before issuance. Missing Bill To/Ship To addresses block download/save/email until filled in the draft.

## Drive, email and audit

Save uses the existing `checkPdfFolder`, `uploadPdf` and Google user/service-account Drive integration with `DISPATCH_PDF_FOLDER_ID`. The current folder was verified read-only as QUTAITION/DISPATCHORDER. Sharing/authentication/scopes are unchanged. No file is made publicly accessible by this migration.

Save responses return file ID/URL and selected-row count. The UI shows Open PDF and invalidates O2D register/metadata caches immediately, then refreshes source versions and the edited document. The shared O2D link is visible when returning to Step 9.

The Node project previously had no configured Dispatch email sender or reusable mail transport. The new SMTP adapter uses an authorized sender configured with `DISPATCH_EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. It requires TLS and attaches the exact Buffer generated by the common PDF renderer. To/Cc are validated; defaults are Dispatch Order - {Enquiry No} and Please find attached Dispatch Order PDF. Email saves/links the PDF first and sends only after successful link commit. If sending fails, it reports that the PDF/links were already saved rather than implying complete success. Sender setup is still required; no real email was sent during testing.

Durable audit events and submission state live in ignored `runtime/dispatch/`. Actions: DISPATCH_PREVIEW, DISPATCH_PDF_DOWNLOAD, DISPATCH_ORDER_SAVE, DISPATCH_ORDER_EMAIL. Save records include branch, enquiry, selected Srs, customer, file ID/URL, existing local-development actor and timestamp. Repeated successful request IDs return the prior result. Unconfirmed uploads/writes/email attempts retain their file/state and refuse blind retries; review the recorded URL/operation before issuing again. A new document edit is a new submission. Keep runtime/dispatch when restarting to retain this protection.

## API and access compatibility

- GET /api/dispatch/:branch/enquiries
- GET /api/dispatch/:branch/enquiries/:enquiryNo/materials
- POST /api/dispatch/:branch/preview
- POST /api/dispatch/:branch/pdf
- POST /api/dispatch/:branch/save
- POST /api/dispatch/:branch/email

The existing unbranched preview/pdf/save endpoints delegate to the same implementation. Existing quotations are unchanged. The application's original access hook in app.ts is unchanged; new POST endpoints use its existing local/write-enabled restrictions. This project still has its prior production-auth limitations; this migration adds no authentication system or widened permissions.

## Verification and remaining live setup

Final validation after all code, PDF spacing and styling changes: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test` (32 files / 245 tests), and `npm.cmd run build` all passed. The build retains non-fatal third-party Zod annotation and bundle-size warnings. `graphify update .` completed and refreshed the code graph/report. Tests cover both branches, mixed/unapproved/duplicate/stale rows, GST decimals, party GST mapping, selected SR1/SR3 link writes with SR2 untouched, formula protection, no upload on stale data, idempotent retries, same PDF bytes for email, HTTP access restrictions and editor behavior.

Local fixture PDFs were rendered using the existing Edge/Puppeteer renderer and visually compared with the legacy sample. FBD/MUM browser fixtures rendered with no page errors; transporter GST autofill and preview-before-save behavior were checked. Live branch APIs and the Drive folder were read successfully. No live business row, PDF or email was created during testing.

Live FBD C/1/26-27 + Sr1 is A2z Filtration, SKU 1.2-1250-2500-2B-304, Order Qty 5001, Order Rate 120. Its Status PR is blank; actual generation is correctly blocked. Lot and payment terms are blank. Both the O2D party addresses and the existing enquiry master fallback address are blank for this customer. These are not fabricated. MUM has no material rows. To use the live builder: approve the intended material in Step 8, enter missing addresses in the draft (or correct the master), provide the transporter master location, and configure an authorized email sender if email is needed.

## Changed files

New backend: `apps/api/src/modules/dispatch/{config,schema,masters,service,template,routes,email,audit}.ts`; isolated fixtures/tests in `fixture.ts`, `service.test.ts`. New shared types: `packages/shared/src/dispatch.ts` and exports in `index.ts`.

Updated: `apps/api/src/config/env.ts`, `.env.example`, `apps/api/src/modules/documents/routes.ts` (Dispatch block only), `apps/api/src/modules/documents/dispatch-selection.test.ts`, `apps/api/package.json`, `package-lock.json` (decimal.js, Nodemailer and typings).

Frontend: replaced `apps/web/src/features/documents/DispatchPage.tsx`; added `apps/web/src/features/documents/dispatch.css` and `apps/web/src/features/documents/DispatchPage.test.tsx`; updated `apps/web/src/features/o2d/StepCard.tsx` (Create Dispatch Order action), `apps/web/src/features/o2d/O2DDetail.tsx` (branch prop only), and `apps/web/src/features/o2d/Purchase.test.tsx` (corresponding action assertion).

Documentation: this file. Generated navigation artifacts: `graphify-out/graph.json`, `graphify-out/graph.html`, `graphify-out/GRAPH_REPORT.md` and Graphify metadata/backups refreshed by its update command.

Unchanged: CRR/NBD transfer, order numbering, source IDs/names, authentication, party-master writes, quotation behavior, other O2D workflow calculations and timestamps, invoice logic and Drive authorization. `apps/web/vite.config.ts` was touched to reload a stale development module; its contents did not change.

References for added libraries: [Decimal.js API](https://mikemcl.github.io/decimal.js/) and [Nodemailer SMTP](https://nodemailer.com/smtp).

## Components and functions

- Replaced `DispatchPage` with the structured builder; retained existing page routes and app shell. `StepCard` now opens the builder, and `O2DDetail` passes its existing branch value.
- Added `DispatchOrderService` methods `enquiries`, `materials`, `buildDocument`, `preview`, `download`, and `save`; shared helpers `dispatchTotals` and `dispatchFilename`.
- Added `dispatchCompany`, `dispatchHtml`, `DispatchMasters.party`, `DispatchMasters.transporters`, party/transporter record adapters, `sendDispatchEmail`, `dispatchEmailReady`, and `DispatchAudit` for this module.
- Added `dispatchRoutes`, dispatch request schemas and shared document types. `documentRoutes` delegates its Dispatch endpoints to this module; its quotation handlers are unchanged.
- Reused the current O2D repository, workflow metadata, existing customer repository fallback, `renderPdf`, `checkPdfFolder`, `uploadPdf`, `cellWrite`, `o2dAuditRequests`, and `withCreationLock`.

## Requested acceptance report

1. **Legacy logic:** selected materials, approval, one customer, party lookup, terms, references, lots, charges, PDF layout and email attachment flow migrated from the inspected legacy source.
2. **Identity:** branch + Enquiry No + Sr no throughout; no order number generated or used.
3. **FBD:** verified Faridabad address, batch and GSTIN in centralized configuration.
4. **MUM:** verified Kalamboli address, Maharashtra batch and GSTIN; no Faridabad address fallback.
5. **Party lookup:** current branch New Party Addition, with existing enquiry customer repository fallback for missing data.
6. **Ship To / Bill To:** separate addresses/GSTINs auto-populate when present; draft edits do not modify masters. The live test customer has missing addresses.
7. **Transporter:** dropdown and server-resolved read-only GST implemented and fixture-tested. Live master location still needed; neither current O2D workbook has the tab.
8. **Material lines:** current mapped lots, material dimensions, Nos, Order Qty and Order Rate; one line per selected Sr.
9. **Loading:** sum the verified source if present; editable draft value defaults to zero when absent, as in the current Sheets.
10. **GST/totals:** centralized 18% default, editable draft GST and decimal arithmetic shared by all outputs.
11. **Preview:** same document and HTML as PDF; both branch fixtures rendered successfully in the browser.
12. **Download:** final PDF download independent of Drive; FBD/MUM fixture PDFs rendered and visually checked against the sample.
13. **Drive save:** existing integration reused; configured folder read access verified. Upload behavior tested with isolated dependencies, not a live business upload.
14. **Exact links:** selected Sr1/Sr3 updated in tests while Sr2 remained untouched. Only mapped Dispatch Order link cells and separate audit records are written; formulas and workflow timestamps are unchanged.
15. **Email:** To/Cc/subject/message and exact PDF attachment implemented; isolated tests verify sending after link save. Authorized SMTP sender configuration is still needed; no live email sent.
16. **Tests:** final typecheck, lint and all 245 tests passed.
17. **Build:** final production build passed; existing non-fatal dependency/bundle warnings remain.
