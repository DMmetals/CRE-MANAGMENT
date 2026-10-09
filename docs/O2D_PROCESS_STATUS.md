# O2D Process Status implementation - 8 October 2026

The existing material drawer retains Overview, Process Status, Purchase, Dispatch, Invoice History and Activity. Process Status now contains Step 2 and Step 3 cards. Identity remains Enquiry No + Sr no, and the existing CRR/NBD transfer implementation was not changed by this work.

## Physical mappings verified against both live Sheets

Both actual gid=0 tab names were detected as FBD and MUM, with headers on row 6. The upper Step 2, Step 3 and Step 4 labels define section boundaries. Repeated headers are resolved within those boundaries; plain first/last Status or Planned matching is not used for workflow edits.

| UI field                    | Actual header               | Column  | Section                     |
| --------------------------- | --------------------------- | ------- | --------------------------- |
| Order Receiving Date & Time | Order Receiving Date & Time | V (22)  | PO receipt, shown in Step 2 |
| PO receipt planned          | Planned, occurrence 1       | W (23)  | PO receipt timing           |
| PO receipt actual           | Actual, occurrence 1        | X (24)  | PO receipt timing           |
| PO Copy                     | PO PHOTO                    | Y (25)  | Upload/view/replace         |
| Revised PO Copy             | Rev PO Photo                | Z (26)  | Upload/view/replace         |
| PO receipt delay            | Time Delay, occurrence 1    | AA (27) | PO receipt timing           |
| Planned                     | Planned, occurrence 2       | AB (28) | Step 2                      |
| Actual                      | Actual, occurrence 2        | AC (29) | Step 2                      |
| Order Verification          | Status, occurrence 1        | AD (30) | Step 2                      |
| Time Delay                  | Time Delay (Auto) P         | AE (31) | Step 2 timing               |
| Planned                     | Planned P                   | AF (32) | Step 3                      |
| Actual                      | Actual P                    | AG (33) | Step 3                      |
| Terms & Condition           | Terms & Condition           | AH (34) | Step 3                      |
| Size & Rate Approval        | Size & Rate Approval        | AI (35) | Step 3                      |
| Material Status             | Material Status             | AJ (36) | Step 3                      |
| Lot NO.                     | Lot NO.                     | AK (37) | Step 3, manual text         |
| CRDD                        | CRDD                        | AL (38) | Step 3, calendar date       |
| PO Approval Status          | PO Approval Status          | AM (39) | Step 3                      |
| Time Delay                  | Time Delay (Auto) P1        | AN (40) | Step 3 timing               |

## Actual dropdown discovery and displayed values

The live FBD and MUM scans found **no data validation rules** in the relevant columns through row 998. No Sheet validation lists were created by this change. The backend therefore supplies the user's explicit business options as defaults. Metadata identifies their source as supplied-default; these must not be described as values read from existing Sheet validation.

| Dropdown             | FBD and MUM displayed options                                                                                                        | Current source                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Order Verification   | Verified; CANCEL                                                                                                                     | Explicit business rule                |
| Terms & Condition    | Approved; Hold; Rejected                                                                                                             | Supplied default, no Sheet validation |
| Size & Rate Approval | Approved; Hold; Rejected                                                                                                             | Supplied default, no Sheet validation |
| Material Status      | Material In Stock (MUM); To Purchase; Jindal Booking; Job Work; POP; Material in Stock; Material in Stock DLH; Material in Stock FBD | Supplied default, no Sheet validation |
| PO Approval Status   | Approved; Hold; Cancelled                                                                                                            | Supplied default, no Sheet validation |

GET `/api/o2d/:branch/meta?rowId=<id>` returns workflow field mappings, dropdowns, dropdownSources, warnings, writesEnabled and uploadMaxBytes. The optional row ID selects the material's exact validation rule. ONE_OF_LIST and ONE_OF_RANGE are supported, including additional Sheet values. Existing Sheet validation takes precedence over defaults. Conflicting column rules without an exact-row rule produce a visible error. Google read failures do not silently switch to defaults. The UI consumes these options from metadata and does not duplicate the lists in React.

## PO upload and revised PO upload

Both use `POST /api/o2d/:branch/rows/:rowId/po`, multipart/form-data:

- `file`: PDF, JPG/JPEG or PNG; maximum 10 MB.
- `enquiryNo`, `srNo`: the selected material's identity.
- `type`: PO or REVISED_PO.
- `version`: the UI's current row version, also accepted by the endpoint as an optional concurrency check for other clients.

PO writes only Y; REVISED_PO writes only Z. The service validates file extension, MIME type, signature, size, exact identity, current row and protected/formula state. It rechecks the row immediately before writing. Regular PATCH cannot edit PO URLs as text.

The existing Drive authentication and upload service are reused. Folder: `1keO8Mn4_mymfYiIVPSn8YEcn6LbaGjZ4`, named **QUTAITION/DISPATCHORDER**. Optional O2D_PO_FOLDER_ID overrides the destination; otherwise QUOTATION_PDF_FOLDER_ID is reused. No new authentication or folder tree is created.

Names use sanitized enquiry number, SR number, PO/REVISED_PO and a timestamp. The UI shows Upload PO Copy/Upload Revised PO, then View/Replace actions with no raw URL field. Uploading disables duplicate clicks and shows a success notice. Unsaved manual edits remain available after an upload and use the refreshed row version. Replaced original files are retained. A newly uploaded file is trashed only when a confirmed pre-write failure leaves it unlinked. Uncertain Sheet write results retain the uploaded file and ask the user to refresh before retrying.

## Saves, formulas and dates

Save changes sends only dirty manual cells. Backend validation checks Enquiry No, Sr no, stable row identity and version, reads current dropdown rules, then rereads values, formulas, protections and settings before committing. Updates and audit entries are submitted in one Sheets batch.

Formula cells and array output columns remain protected. Current live array outputs are Q Balance Qty, S Total Value and BS Planned Dispatch Date. Receiving date remains source-owned. Time-delay fields remain read-only. Current Planned/Actual cells inspected for C/1/26-27, Sr 1 are blank manual cells; these are editable, and become read-only if Sheet formulas/protections are present. Formula state is checked again on every write.

CRDD uses a native date input. YYYY-MM-DD is validated as a real calendar date, converted in UTC to a Sheets serial date and written as numberValue with DATE format dd/MM/yyyy. It is not written as a display string. Reading recognizes Indian dates and serial values without host-timezone drift. Other formatting and all unrelated cells are preserved.

Audit actions include UPLOAD_PO, REPLACE_PO, UPLOAD_REVISED_PO, REPLACE_REVISED_PO, UPDATE_ORDER_VERIFICATION, UPDATE_TERMS_CONDITION, UPDATE_SIZE_RATE_APPROVAL, UPDATE_MATERIAL_STATUS, UPDATE_LOT_NO, UPDATE_CRDD and UPDATE_PO_APPROVAL_STATUS. Entries include timestamp, current local-development actor, branch, enquiry, serial, old and new values. Existing audit columns A:G are preserved; branch/enquiry/sr metadata uses H:J. The existing authorized-local-access gate remains in force.

## Verification

- Typecheck: passed.
- Lint: passed.
- Tests: 202 passed across 27 files, including both branches, section mapping, exact/range validation options, missing/ambiguous rules, formula races, exact-row saves, audit actions, dates, multipart limits, uploads and replacements.
- Live API: FBD and MUM metadata/registers returned HTTP 200. FBD currently has one row; MUM is empty.
- Live browser: opened FBD C/1/26-27, Sr 1; checked all controls, dirty state and date input; no JavaScript errors. Screenshot: runtime/verification/o2d-process-status.png. MUM controls and saves are covered with isolated fixtures because its live register is empty.
- Live Drive: temporary PO and revised-PO PDFs uploaded through the existing account into the configured folder. Downloaded bytes matched both originals. Both verification files were moved to trash afterward.
- Sheet mutations in upload/save tests use isolated mocked repositories. No dummy PO, date, status or lot was written into a real business row.
- Build: passed. Existing nonfatal Vite bundle-size and dependency annotation warnings remain.
- Graphify: code map refreshed successfully after implementation.

API implementation follows the Google Sheets [cell value and format documentation](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells) and [validation condition documentation](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/other). Multipart streaming and limits use the [Fastify multipart plugin](https://github.com/fastify/fastify-multipart).
