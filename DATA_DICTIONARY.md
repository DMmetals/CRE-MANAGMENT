> O2D schema update (2026-10-08): use [the verified O2D dictionary](docs/O2D_DATA_DICTIONARY.md). The older O2D tables below are historical; the current layout has 140 columns, starts with Sr no in A, and uses Enquiry No + Sr no without an Order No.

# Data dictionary - live spreadsheet verification

Verified read-only at 2026-10-07T07:12:03.620Z. This inventory contains tab metadata and header rows only, not business records or credentials.

| Source | Actual tab | Header row | Access | Header cells |
|---|---|---|---|---|
| CRR | FMS | 7 | connected | 44 |
| NBD | FMS | 7 | connected | 44 |
| O2D_FBD | FBD | 6 | connected | 141 |
| O2D_MUM | MUM | 6 | connected | 141 |

## Discrepancies and mapping constraints

- CRR column 42 (AP) is blank; NBD column 42 is BhikhaJi. Do not assume identical headers.
- Both FMS sources have trailing whitespace/newlines in some labels, including Status Date (Auto) and Total Qty. Preserve raw headers and normalize matching carefully.
- Both O2D tables have blank column A headers. Do not assume this identifies Order No until the legacy mapping is inspected.
- O2D includes duplicate Status, Planned, Actual, Time Delay and repeating dispatch/invoice headers. A simple normalized name-to-single-column map would lose information. Require stage/occurrence-aware mapping and fail on unresolved ambiguity.
- The O2D final-stage header at BQ is Status, not FINAL STATUS. It requires a documented stage-specific mapping.
- The actual customer-master tab is New Party addition in CRR/NBD and New Party Addition in O2D. Preserve exact tab casing.
- For CRR/NBD quotations, match the customer name in column A of `New Party addition` and read the customer address from column F. A blank F cell produces a blank quotation address; no other column is substituted.
- Legacy-reference is still missing. Comparisons with old functions and business mappings remain unverified; Phase 2 has not started.

## CRR

Actual tabs: "Form responses 6", "FMS", "DM", "MM", "For PC", "New Party addition", "Salesperson wise", "Proforma Invoice-DM", "Consolidated", "Proforma Invoice-MM", "Loss/Nego", "List Of QUT DM", "List Of QUT MM", "Client Wise Report", "Material Details", "Quotation-DM", "Quotation-MM", "Stocklist", "Escalation1", "Setup", "Escalation2", "CRR/ NBD", "ItemWise Report", "Detailed ClientWise", "SOP", "Holidays", "PC", "Form responses 5", "Doers", "MM_PDF_CLEAN", "DM_PDF_CLEAN".

| Column | Exact header (JSON encoded) |
|---|---|
| A | "Date" |
| B | "Enquiry No." |
| C | "Customer Name" |
| D | "Sales Person" |
| E | "Branch" |
| F | "State (Auto)" |
| G | "Purchaser Name (Auto)" |
| H | "Contact Number (Auto)" |
| I | "Email Address (Auto)" |
| J | "Material Type" |
| K | "SKU" |
| L | "THK" |
| M | "WIDTH" |
| N | "LGT" |
| O | "FINISH" |
| P | "GRADE" |
| Q | "Edge" |
| R | "Qty" |
| S | "LIMIT" |
| T | "Enq Mode" |
| U | "Enquiry Noted Timestamp (Auto)" |
| V | "Planned (Auto) P" |
| W | "Actual (Auto) P" |
| X | "Rate" |
| Y | "Value with GST (Auto)" |
| Z | "Quote Link" |
| AA | "Time Delay (Auto) P" |
| AB | "Planned (Auto)" |
| AC | "Status Date (Auto)\n" |
| AD | "Won/ Loss" |
| AE | "Remarks" |
| AF | "PO Number" |
| AG | "Total Value (With GST)" |
| AH | "Total Qty " |
| AI | "Order Qty" |
| AJ | "Order Date" |
| AK | "Time Delay (Auto)" |
| AL | "Sr No." |
| AM | "Quote Number & Date (Auto)" |
| AN | "Order ID" |
| AO | "Sent" |
| AP | "" |
| AQ | "DB_ID" |
| AR | "LAST_EDIT_TS" |

## NBD

Actual tabs: "Form responses 6", "FMS", "DM", "MM", "For PC", "New Party addition", "Salesperson wise", "Proforma Invoice-DM", "Consolidated", "Proforma Invoice-MM", "Loss/Nego", "List Of QUT DM", "List Of QUT MM", "Client Wise Report", "Material Details", "Quotation-DM", "Quotation-MM", "Stocklist", "Escalation1", "Setup", "Escalation2", "CRR/ NBD", "ItemWise Report", "Detailed ClientWise", "SOP", "Holidays", "PC", "Form responses 5", "Doers", "MM_PDF_CLEAN".

| Column | Exact header (JSON encoded) |
|---|---|
| A | "Date" |
| B | "Enquiry No." |
| C | "Customer Name" |
| D | "Sales Person" |
| E | "Branch" |
| F | "State (Auto)" |
| G | "Purchaser Name (Auto)" |
| H | "Contact Number (Auto)" |
| I | "Email Address (Auto)" |
| J | "Material Type" |
| K | "SKU" |
| L | "THK" |
| M | "WIDTH" |
| N | "LGT" |
| O | "FINISH" |
| P | "GRADE" |
| Q | "Edge" |
| R | "Qty" |
| S | "LIMIT" |
| T | "Enq Mode" |
| U | "Enquiry Noted Timestamp (Auto)" |
| V | "Planned (Auto) P" |
| W | "Actual (Auto) P" |
| X | "Rate" |
| Y | "Value with GST (Auto)" |
| Z | "Quote Link" |
| AA | "Time Delay (Auto) P" |
| AB | "Planned (Auto)" |
| AC | "Status Date (Auto)\n" |
| AD | "Won/ Loss" |
| AE | "Remarks" |
| AF | "PO Number" |
| AG | "Total Value (With GST)" |
| AH | "Total Qty " |
| AI | "Order Qty" |
| AJ | "Order Date" |
| AK | "Time Delay (Auto)" |
| AL | "Sr No." |
| AM | "Quote Number & Date (Auto)" |
| AN | "Order ID" |
| AO | "Sent" |
| AP | "BhikhaJi" |
| AQ | "DB_ID" |
| AR | "LAST_EDIT_TS" |

## O2D_FBD

Actual tabs: "FBD", "New Party Addition".

| Column | Exact header (JSON encoded) |
|---|---|
| A | "" |
| B | "Sr no" |
| C | "Enquiry No." |
| D | "Customer Name" |
| E | "Sales Person" |
| F | "Category" |
| G | "PO Number" |
| H | "PO Date" |
| I | "SKU" |
| J | "Thk" |
| K | "Width" |
| L | "Lgt" |
| M | "Finish" |
| N | "Grade" |
| O | "Edge" |
| P | "Nos" |
| Q | "Order Qty" |
| R | "Balance Qty" |
| S | "Order Rate" |
| T | "Total Value" |
| U | "LIMIT" |
| V | "Payment Terms" |
| W | "Order Receiving Date & Time" |
| X | "Planned " |
| Y | "Actual " |
| Z | "PO PHOTO" |
| AA | "Rev PO Photo" |
| AB | "Time Delay" |
| AC | "Planned " |
| AD | "Actual " |
| AE | "Status" |
| AF | "Time Delay (Auto)  P" |
| AG | "Planned P" |
| AH | "Actual P" |
| AI | "Terms & Condition" |
| AJ | "Size & Rate Approval" |
| AK | "Material Status" |
| AL | "Lot NO." |
| AM | "CRDD" |
| AN | "PO Approval Status" |
| AO | "Time Delay (Auto) P1" |
| AP | "Planned D" |
| AQ | "Actual D" |
| AR | "Status D" |
| AS | "Time Delay (Auto) D" |
| AT | "Planned G" |
| AU | "Actual G" |
| AV | "Status G" |
| AW | "Time Delay (Auto) G" |
| AX | "Purchase Target Date" |
| AY | "Jindal Expected Date" |
| AZ | "Job Work Expected Date" |
| BA | "REVISED CRDD" |
| BB | "Planned PR" |
| BC | "Actual PR" |
| BD | "Status PR" |
| BE | "Time Delay (Auto) PR" |
| BF | "Planned" |
| BG | "Actual" |
| BH | "Dispatch Order link" |
| BI | "Time Delay" |
| BJ | "Planned SG" |
| BK | "Actual SG" |
| BL | "VEHICLE NUMBER" |
| BM | "TRASPOTER NAME" |
| BN | "" |
| BO | "Remarks/ Challenges" |
| BP | "Time Delay" |
| BQ | "Status" |
| BR | "Final Status TImestam[p" |
| BS | "Move status \n" |
| BT | "Planned Dispatch Date" |
| BU | "Qty Dispatched" |
| BV | "Dispatch Date" |
| BW | "Invoice No." |
| BX | "Invoice Date" |
| BY | "Invoice Value" |
| BZ | "Invoice Due Date" |
| CA | "Planned Dispatch Date" |
| CB | "Qty Dispatched" |
| CC | "Dispatch Date" |
| CD | "Invoice No." |
| CE | "Invoice Date" |
| CF | "Invoice Value" |
| CG | "Invoice Due Date" |
| CH | "Planned Dispatch Date" |
| CI | "Qty Dispatched" |
| CJ | "Dispatch Date" |
| CK | "Invoice No." |
| CL | "Invoice Date" |
| CM | "Invoice Value" |
| CN | "Invoice Due Date" |
| CO | "Planned Dispatch Date" |
| CP | "Qty Dispatched" |
| CQ | "Dispatch Date" |
| CR | "Invoice No." |
| CS | "Invoice Date" |
| CT | "Invoice Value" |
| CU | "Invoice Due Date" |
| CV | "Planned Dispatch Date" |
| CW | "Qty Dispatched" |
| CX | "Dispatch Date" |
| CY | "Invoice No." |
| CZ | "Invoice Date" |
| DA | "Invoice Value" |
| DB | "Invoice Due Date" |
| DC | "Planned Dispatch Date" |
| DD | "Qty Dispatched" |
| DE | "Dispatch Date" |
| DF | "Invoice No." |
| DG | "Invoice Date" |
| DH | "Invoice Value" |
| DI | "Invoice Due Date" |
| DJ | "Planned Dispatch Date" |
| DK | "Qty Dispatched" |
| DL | "Dispatch Date" |
| DM | "Invoice No." |
| DN | "Invoice Date" |
| DO | "Invoice Value" |
| DP | "Invoice Due Date" |
| DQ | "Planned Dispatch Date" |
| DR | "Qty Dispatched" |
| DS | "Dispatch Date" |
| DT | "Invoice No." |
| DU | "Invoice Date" |
| DV | "Invoice Value" |
| DW | "Invoice Due Date" |
| DX | "Planned Dispatch Date" |
| DY | "Qty Dispatched" |
| DZ | "Dispatch Date" |
| EA | "Invoice No." |
| EB | "Invoice Date" |
| EC | "Invoice Value" |
| ED | "Invoice Due Date" |
| EE | "Planned Dispatch Date" |
| EF | "Qty Dispatched" |
| EG | "Dispatch Date" |
| EH | "Invoice No." |
| EI | "Invoice Date" |
| EJ | "Invoice Value" |
| EK | "Invoice Due Date" |

## O2D_MUM

Actual tabs: "MUM", "New Party Addition".

| Column | Exact header (JSON encoded) |
|---|---|
| A | "" |
| B | "Sr no" |
| C | "Enquiry No." |
| D | "Customer Name" |
| E | "Sales Person" |
| F | "Category" |
| G | "PO Number" |
| H | "PO Date" |
| I | "SKU" |
| J | "Thk" |
| K | "Width" |
| L | "Lgt" |
| M | "Finish" |
| N | "Grade" |
| O | "Edge" |
| P | "Nos" |
| Q | "Order Qty" |
| R | "Balance Qty" |
| S | "Order Rate" |
| T | "Total Value" |
| U | "LIMIT" |
| V | "Payment Terms" |
| W | "Order Receiving Date & Time" |
| X | "Planned " |
| Y | "Actual " |
| Z | "PO PHOTO" |
| AA | "Rev PO Photo" |
| AB | "Time Delay" |
| AC | "Planned " |
| AD | "Actual " |
| AE | "Status" |
| AF | "Time Delay (Auto)  P" |
| AG | "Planned P" |
| AH | "Actual P" |
| AI | "Terms & Condition" |
| AJ | "Size & Rate Approval" |
| AK | "Material Status" |
| AL | "Lot NO." |
| AM | "CRDD" |
| AN | "PO Approval Status" |
| AO | "Time Delay (Auto) P1" |
| AP | "Planned D" |
| AQ | "Actual D" |
| AR | "Status D" |
| AS | "Time Delay (Auto) D" |
| AT | "Planned G" |
| AU | "Actual G" |
| AV | "Status G" |
| AW | "Time Delay (Auto) G" |
| AX | "Purchase Target Date" |
| AY | "Jindal Expected Date" |
| AZ | "Job Work Expected Date" |
| BA | "REVISED CRDD" |
| BB | "Planned PR" |
| BC | "Actual PR" |
| BD | "Status PR" |
| BE | "Time Delay (Auto) PR" |
| BF | "Planned" |
| BG | "Actual" |
| BH | "Dispatch Order link" |
| BI | "Time Delay" |
| BJ | "Planned SG" |
| BK | "Actual SG" |
| BL | "VEHICLE NUMBER" |
| BM | "TRASPOTER NAME" |
| BN | "" |
| BO | "Remarks/ Challenges" |
| BP | "Time Delay" |
| BQ | "Status" |
| BR | "Final Status TImestam[p" |
| BS | "Move status \n" |
| BT | "Planned Dispatch Date" |
| BU | "Qty Dispatched" |
| BV | "Dispatch Date" |
| BW | "Invoice No." |
| BX | "Invoice Date" |
| BY | "Invoice Value" |
| BZ | "Invoice Due Date" |
| CA | "Planned Dispatch Date" |
| CB | "Qty Dispatched" |
| CC | "Dispatch Date" |
| CD | "Invoice No." |
| CE | "Invoice Date" |
| CF | "Invoice Value" |
| CG | "Invoice Due Date" |
| CH | "Planned Dispatch Date" |
| CI | "Qty Dispatched" |
| CJ | "Dispatch Date" |
| CK | "Invoice No." |
| CL | "Invoice Date" |
| CM | "Invoice Value" |
| CN | "Invoice Due Date" |
| CO | "Planned Dispatch Date" |
| CP | "Qty Dispatched" |
| CQ | "Dispatch Date" |
| CR | "Invoice No." |
| CS | "Invoice Date" |
| CT | "Invoice Value" |
| CU | "Invoice Due Date" |
| CV | "Planned Dispatch Date" |
| CW | "Qty Dispatched" |
| CX | "Dispatch Date" |
| CY | "Invoice No." |
| CZ | "Invoice Date" |
| DA | "Invoice Value" |
| DB | "Invoice Due Date" |
| DC | "Planned Dispatch Date" |
| DD | "Qty Dispatched" |
| DE | "Dispatch Date" |
| DF | "Invoice No." |
| DG | "Invoice Date" |
| DH | "Invoice Value" |
| DI | "Invoice Due Date" |
| DJ | "Planned Dispatch Date" |
| DK | "Qty Dispatched" |
| DL | "Dispatch Date" |
| DM | "Invoice No." |
| DN | "Invoice Date" |
| DO | "Invoice Value" |
| DP | "Invoice Due Date" |
| DQ | "Planned Dispatch Date" |
| DR | "Qty Dispatched" |
| DS | "Dispatch Date" |
| DT | "Invoice No." |
| DU | "Invoice Date" |
| DV | "Invoice Value" |
| DW | "Invoice Due Date" |
| DX | "Planned Dispatch Date" |
| DY | "Qty Dispatched" |
| DZ | "Dispatch Date" |
| EA | "Invoice No." |
| EB | "Invoice Date" |
| EC | "Invoice Value" |
| ED | "Invoice Due Date" |
| EE | "Planned Dispatch Date" |
| EF | "Qty Dispatched" |
| EG | "Dispatch Date" |
| EH | "Invoice No." |
| EI | "Invoice Date" |
| EJ | "Invoice Value" |
| EK | "Invoice Due Date" |

