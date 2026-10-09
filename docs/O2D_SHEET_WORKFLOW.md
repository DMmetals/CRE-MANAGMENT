# O2D drawer: verified Sheet workflow

Verified against both configured Google Sheets on 9 October 2026. This report supersedes the tab grouping described in O2D_PURCHASE_CHANGES.md and O2D_PROCESS_STATUS.md. It does not change the source spreadsheets.

## Source metadata and branch differences

Both actual tabs use row 1 for Step, row 2 for What/title, row 3 for Who, row 4 for How, row 5 for SLA, and row 6 for field headers. The API reads merged header ranges separately for FBD and MUM; the physical ranges below are inspection results, not React constants. Spreadsheet timezone: Asia/Calcutta.

| Drawer tab     | FBD step | MUM step | Actual Sheet title             | Columns | Who    | How                                  | SLA      |
| -------------- | -------- | -------- | ------------------------------ | ------- | ------ | ------------------------------------ | -------- |
| Process Status | 2        | 2        | Order Verification & sign      | AB:AE   | Priya  | Verification                         | 1:00:00  |
| Process Status | 3        | 3        | Order Approval by sales Person | AF:AN   | Priya  | Mail                                 | 1:00:00  |
| Process Status | 4        | 4        | Limit Approval                 | AO:AR   | Dinesh | As per Balance Limit & Payment Cycle | 2:00:00  |
| Process Status | 5        | 5        | Order Verification             | AS:AV   | Ganesh | Compare with Order Copy              | 1:00:00  |
| Purchase       | 7        | 7        | Materail Status                | AW:AZ   | Ganesh | Manually                             | 03:00:00 |
| Purchase       | 8        | 8        | Approval For Dispatch          | BA:BD   | Priya  | Based on Order Slip Given by Sagar   | 3:00:00  |
| Dispatch       | 9        | 9        | generate Dispatch Order        | BE:BH   | CRE    | Based on Order Slip Given by Sagar   | 3:00:00  |
| Dispatch       | 10       | 6        | Dispatch Planning              | BI:BO   | Sagar  | Check With Stock                     | 3:00:00  |
| Dispatch       | Final    | Final    | Final Order Status             | BP:BR   | -      | -                                    | -        |

MUM actually labels Dispatch Planning Step 6. The drawer preserves Step 6 in MUM and Step 10 in FBD. Both Sheets spell Step 7's title `Materail Status`; this source spelling is preserved. Final Order Status is one merged heading across BP1:BR5, so there is no invented Who/How/SLA.

Step 1, Upload Purchase Order, covers F:V (Priya / Auto from Enquiry to Order / 2:00:00). Its basic order fields remain in Overview. V belongs to this merge; W:AA have no named step header. Existing Payment Terms, receipt, and PO controls in U:AA remain in a separate, unnumbered support card titled from V6: `Order Receiving Date & Time`. They are not falsely relabeled as Step 2. The actual Step 2 merge starts at AB.

Later invoice blocks also contain Step 9 headings. These remain Invoice History and are excluded from workflow header discovery after Move Status.

## Exact field mappings

The following physical cells apply to the inspected FBD and MUM layouts. Runtime metadata retains physical column, original header, section and occurrence; user labels do not show occurrence suffixes.

| Section                  | Exact source columns and fields                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt / PO support     | U Payment Terms; V Order Receiving Date & Time; W Planned; X Actual; Y PO PHOTO; Z Rev PO Photo; AA Time Delay                                                    |
| Step 2                   | AB Planned; AC Actual; AD Status; AE Time Delay (Auto) P                                                                                                          |
| Step 3                   | AF Planned P; AG Actual P; AH Terms & Condition; AI Size & Rate Approval; AJ Material Status; AK Lot NO.; AL CRDD; AM PO Approval Status; AN Time Delay (Auto) P1 |
| Step 4                   | AO Planned D; AP Actual D; AQ Status D; AR Time Delay (Auto) D                                                                                                    |
| Step 5                   | AS Planned G; AT Actual G; AU Status G; AV Time Delay (Auto) G                                                                                                    |
| Step 7                   | AW Purchase Target Date; AX Jindal Expected Date; AY Job Work Expected Date; AZ REVISED CRDD                                                                      |
| Step 8                   | BA Planned PR; BB Actual PR; BC Status PR; BD Time Delay (Auto) PR                                                                                                |
| Step 9                   | BE Planned; BF Actual; BG Dispatch Order link; BH Time Delay                                                                                                      |
| Step 10 FBD / Step 6 MUM | BI Planned SG; BJ Actual SG; BK VEHICLE NUMBER; BL TRASPOTER NAME; BN Remarks/ Challenges; BO Time Delay                                                          |
| Final Order Status       | BP Status; BQ Final Status TImestam[p; BR Move status                                                                                                             |

BM has no field header or data/formula in the inspected material/template cells. It is an unnamed spacer inside the dispatch merge and is hidden. No business meaning or replacement label is invented.

Inside each numbered card, Planned/Actual/Status/Time Delay use those simple labels. Final Status, timestamp, transporter and remarks have readable UI labels while the underlying Sheet headers remain unchanged.

## Values, controls and formula preservation

- The new metadata returns raw user-entered value/formula, effective value, formatted value, formula state, editability and validation options per field. Displayed system values use the Sheet's formatted result.
- All Planned and Time Delay fields are read-only. Neither React nor Node calculates them. A blank source cell remains blank.
- Direct cell formulas, existing array-output columns and non-editable protected ranges are preserved. Formula-controlled Actual, dates and final timestamps cannot be edited.
- Existing automatic Actual D/G/PR and final-status timestamp behavior reuses `purchaseActualWrite`. Existing timestamps are retained; opening a drawer does not create timestamps. Step 9 Actual remains read-only and is not synthesized.
- Manual receipt Actual, Step 2 Actual and Step 3 Actual retain the existing editable-field policy when not formula/protection controlled.
- AL CRDD and AW:AZ use calendar inputs when editable. Dates use existing date-only serial conversion and formatting, avoiding timezone-based one-day shifts. Formula-driven dates display the Sheet result as read-only text.
- AK Lot NO. is manual text. PO and Revised PO use the existing upload/view/replace component and API.
- Saves send only dirty fields. Workflow saves require Enquiry No. + Sr no + SKU, existing row ID and version. The backend rechecks identity, formulas, protections, metadata and validation before committing exact cells. Existing audit actions are reused. Refresh after saving reloads the row and calculated metadata.
- Existing legacy workflow/purchase API response fields remain available. New stepLayout/row metadata and workflow save context are additive.

## Dropdown sources and options

The inspection found no data-validation rules in V7:BR998 in either connected workbook, including empty/template rows. The backend reads actual validation for the selected row (and the existing uniform-column fallback), supports list and range validation, and gives Sheet options priority. It does not install or change Sheet validation. The current fallback choices are previously supplied business options, not a React list:

| Field                              | Current source             | Options                                                                                                                                                                                     |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 2 Status                      | Supplied business fallback | Verified; CANCEL                                                                                                                                                                            |
| Terms & Condition                  | Supplied business fallback | Approved; Hold; Rejected                                                                                                                                                                    |
| Size & Rate Approval               | Supplied business fallback | Approved; Hold; Rejected                                                                                                                                                                    |
| Material Status                    | Supplied business fallback | Material In Stock (MUM); To Purchase; Jindal Booking; Job Work; POP; Material in Stock; Material in Stock DLH; Material in Stock FBD                                                        |
| PO Approval Status                 | Supplied business fallback | Approved; Hold; Cancelled                                                                                                                                                                   |
| Step 8 Status PR                   | Supplied business fallback | Approved; Hold; Cancelled                                                                                                                                                                   |
| Final Order Status                 | Supplied business fallback | Closed; Cancelled; Short closed; Excess sold with buyer's consent; Partly closed, Party cancelled; Order Amended; Order Shift to MUM; Order Shift to CHN; Dispatch from delhi; DOUBLE ENTRY |
| Status D / Status G                | No Sheet list validation   | Existing manual status input; becomes dropdown when Sheet list/range validation exists                                                                                                      |
| Vehicle Number / Transporter Name  | No Sheet list validation   | Manual input; uses Sheet dropdown when present                                                                                                                                              |
| Remarks / Challenges / Move Status | No Sheet list validation   | Manual input; uses Sheet dropdown when present                                                                                                                                              |

Dropdowns allow an unselected value; existing out-of-list values remain visible. A Step 2 validation mismatch against Verified/CANCEL is reported in metadata and the UI before the user edits; the existing rule is not modified. Lot NO. remains text even if a list is encountered. No Remarks fallback list is imposed.

## Dispatch Order integration boundary

Step 9 shows Open Dispatch Order when the exact material has an existing valid link. Create Dispatch Order remains disabled with the existing explanation: the production generator is not connected in this repository. The existing draft PDF is not substituted for the user's production document. No PDF design, calculations, address, Drive, email or link-writing business logic was changed. No success link or Actual timestamp is faked.

For these connected O2D tabs, the dispatch-link header is BG; EF is in an invoice block. This drawer change does not write either link column or alter any external generator's configured link storage.

## Files and functions changed for this request

| File                                             | Change                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web/src/features/o2d/StepCard.tsx           | Added reusable StepCard driven by API metadata; existing POUploadField reused                                                                            |
| apps/web/src/features/o2d/O2DDetail.tsx          | Updated O2DDetail metadata query, workflowTab, save and refreshWorkflowRow; three workflow tabs render StepCard; removed user-facing occurrence suffixes |
| apps/web/src/features/o2d/o2d.css                | Added scoped step-title and step-badge styles                                                                                                            |
| apps/web/src/features/o2d/PurchaseFields.tsx     | Removed obsolete hardcoded card renderer, replaced by StepCard                                                                                           |
| apps/api/src/modules/o2d/steps.ts                | Added stepGridSchema, sheetStepGroups, stepFieldLabel, buildStepLayout, O2DStepReader.read and stepLayoutSignature                                       |
| apps/api/src/modules/o2d/repository.ts           | Added optional O2DRepository.steps and GoogleSheetsO2DRepository.steps                                                                                   |
| apps/api/src/modules/o2d/service.ts              | Extended O2DService.workflowMeta with additive stepLayout and current row                                                                                |
| apps/api/src/modules/o2d/updates.ts              | Extended o2dUpdateSchema and O2DUpdateService.update for workflow metadata validation, exact-row dates and existing Actual/audit handling                |
| apps/api/src/modules/o2d/workflow.ts             | Added optional listsOnly argument to O2DValidationReader.readColumns; old callers retain existing behavior                                               |
| packages/shared/src/o2d.ts                       | Added O2DStepField, O2DWorkflowStep, O2DStepLayout and optional O2DMeta fields                                                                           |
| packages/shared/src/index.ts                     | Exported the new metadata types                                                                                                                          |
| apps/api/src/modules/o2d/steps-fixture.ts        | Added isolated verified-header fixture for both branches and three material rows                                                                         |
| apps/api/src/modules/o2d/steps.test.ts           | Added metadata, formula, validation, branch, shifted-column, stale-row, exact-row save and audit coverage                                                |
| apps/web/src/features/o2d/ProcessStatus.test.tsx | Updated workflow/PO upload/control tests for metadata-driven cards                                                                                       |
| apps/web/src/features/o2d/Purchase.test.tsx      | Updated tab grouping, values, save/refresh and branch tests                                                                                              |
| apps/web/src/features/o2d/O2D.test.tsx           | Adjusted two label assertions after removing occurrence suffixes                                                                                         |
| docs/O2D_SHEET_WORKFLOW.md                       | This inspection, mapping and verification report                                                                                                         |

CRR/NBD transfer, order numbering, authentication, source IDs/names, register filtering, invoice/audit processing, PDF/Drive/email generation and unrelated formulas were not changed. The main drawer tabs, Close and Save changes controls remain. Generic field labels no longer expose occurrence indexes; their data mappings are unchanged.

## Verification

- Typecheck, lint, full test suite and production build pass: 30 test files, 229 tests.
- Live FBD C/1/26-27, Sr 1 opened in Edge: verified all three workflow tabs, actual headings, read-only Planned values, no numeric occurrence labels, no Column BM and no browser page errors.
- UI Planned values for Steps 4, 5, 8, 9 and 10 match live Sheet metadata exactly. They are currently blank in the source. Populated/evaluated formula results are verified with isolated fixtures; no populated live Planned value is claimed.
- Both live FBD/MUM metadata responses verified. MUM has no live material rows, so its drawer rendering is covered by isolated frontend fixtures with the actual Step 6 header.
- Isolated three-material tests target SR2/SKU2 only, check date serial writes and automatic Actual cells, preserve neighbors/formulas, reject Planned edits, and retain existing audit actions.
- No live business records, formulas, validations, PDFs or links were written during verification.

The production build reports existing non-fatal dependency annotation and bundle-size warnings; no unrelated dependency or bundle changes were made.

Graphify maintenance completed with `graphify update .`: generated `graphify-out/graph.json`, `graphify-out/graph.html` and `graphify-out/GRAPH_REPORT.md` were refreshed. These are navigation artifacts, not application logic.
