# O2D data dictionary

Inspected through the existing service-account Google Sheets API on 2026-10-08. This file and the schema snapshot contain header metadata only, never customer rows.

## Sources

| Branch | Spreadsheet ID                               | Actual gid=0 tab | Header row | Physical columns |
| ------ | -------------------------------------------- | ---------------- | ---------- | ---------------- |
| FBD    | 1f0nOcCu4AaFl0DDzODv_mM8i4YYBaCD9lyixfd-DLyo | FBD              | 6          | 140              |
| MUM    | 1f9_splrR2pFkvtnLbKY2glGnidYMXxiSriNOJO6cH6A | MUM              | 6          | 140              |

FBD/MUM header differences: none; all 140 headers, including spelling, repeated blocks and spacer match.

## Identity and business rules

The parent key is Enquiry No. Each material is identified by Enquiry No. + Sr no. No additional sequence, generated number, hidden column or developer metadata is created. Local row identities include spreadsheet, gid, physical row, Enquiry No. and Sr no; edits revalidate identity and row version.

A is Sr no. V is Order Receiving Date & Time and receives the backend transfer timestamp. W is Planned (occurrence 1) and is not written during transfer. BM is the physically present unnamed spacer. BQ contains the exact legacy typo `Final Status TImestam[p`; it is displayed as the final status timestamp. BN is Remarks/ Challenges, BP is Status occurrence 2, BR is Move status.

## Formula protection

The header row itself contains spill formulas. An empty register does not imply empty formula columns. Data cells below Q6 (Balance Qty), S6 (Total Value) and BS6 (Planned Dispatch Date block 1) belong to header ARRAYFORMULAs and are protected throughout the column. Q subtracts the ten dispatch quantities from Order Qty; it therefore computes the initial balance without writing Q. S already computes Order Qty * Order Rate * 1.18; the app preserves this formula and never replaces it with a new calculation. BS derives planned dispatch from CRDD and revised CRDD. Duration formulas in row 5 are outside the data area and remain untouched. Individual cell formulas and Sheet protected ranges are also guarded.

## Transfer mapping

Only Sr no, Enquiry No., Customer Name, Sales Person, Category, PO Number, SKU, Thk, Width, Lgt, Finish, Grade, Edge, Order Qty, Order Rate, LIMIT and Order Receiving Date & Time are initially written. Balance Qty is written only when its target is not formula managed; the inspected workbooks calculate it automatically. Category is source CRR/NBD; branch selects FBD/MUM destination. Nos stays blank. PO Date and Payment Terms stay blank because no verified legacy source is present. Total Value is preserved. Enquiry Remarks is an eligibility condition and is not copied into O2D. Later processing, dispatch and invoice cells remain untouched. Order Qty uses FMS Order Qty when populated, otherwise FMS Qty, as explicitly required by the user on 2026-10-08. Invalid nonblank or nonpositive Order Qty is rejected rather than replaced. Blank Order Date or Total Qty does not block transfer. Source FMS writebacks are not performed.

## Duplicate headers

| Header                | Count | Physical columns (1-based)                   |
| --------------------- | ----- | -------------------------------------------- |
| Planned               | 3     | 23, 28, 57                                   |
| Actual                | 3     | 24, 29, 58                                   |
| Time Delay            | 3     | 27, 60, 67                                   |
| Status                | 2     | 30, 68                                       |
| Planned Dispatch Date | 10    | 71, 78, 85, 92, 99, 106, 113, 120, 127, 134  |
| Qty Dispatched        | 10    | 72, 79, 86, 93, 100, 107, 114, 121, 128, 135 |
| Dispatch Date         | 10    | 73, 80, 87, 94, 101, 108, 115, 122, 129, 136 |
| Invoice No.           | 10    | 74, 81, 88, 95, 102, 109, 116, 123, 130, 137 |
| Invoice Date          | 10    | 75, 82, 89, 96, 103, 110, 117, 124, 131, 138 |
| Invoice Value         | 10    | 76, 83, 90, 97, 104, 111, 118, 125, 132, 139 |
| Invoice Due Date      | 10    | 77, 84, 91, 98, 105, 112, 119, 126, 133, 140 |

Header matching trims and collapses whitespace and ignores case. Unique lookup rejects ambiguity. Occurrence lookup is 1-based. Invoice block mapping verifies the full seven-header pattern instead of silently shifting fields. Blank physical headers remain in the dictionary.

## Physical dictionary (identical for FBD and MUM)

| Number | Letter | Exact header (whitespace normalized for display) | Occurrence | Section          | Business meaning                                  |
| ------ | ------ | ------------------------------------------------ | ---------- | ---------------- | ------------------------------------------------- |
| 1      | A      | Sr no                                            | 1          | Order            | Sr no (order)                                     |
| 2      | B      | Enquiry No.                                      | 1          | Order            | Enquiry No. (order)                               |
| 3      | C      | Customer Name                                    | 1          | Order            | Customer Name (order)                             |
| 4      | D      | Sales Person                                     | 1          | Order            | Sales Person (order)                              |
| 5      | E      | Category                                         | 1          | Order            | Category (order)                                  |
| 6      | F      | PO Number                                        | 1          | Order            | PO Number (order)                                 |
| 7      | G      | PO Date                                          | 1          | Order            | PO Date (order)                                   |
| 8      | H      | SKU                                              | 1          | Order            | SKU (order)                                       |
| 9      | I      | Thk                                              | 1          | Order            | Thk (order)                                       |
| 10     | J      | Width                                            | 1          | Order            | Width (order)                                     |
| 11     | K      | Lgt                                              | 1          | Order            | Lgt (order)                                       |
| 12     | L      | Finish                                           | 1          | Order            | Finish (order)                                    |
| 13     | M      | Grade                                            | 1          | Order            | Grade (order)                                     |
| 14     | N      | Edge                                             | 1          | Order            | Edge (order)                                      |
| 15     | O      | Nos                                              | 1          | Order            | Nos (order)                                       |
| 16     | P      | Order Qty                                        | 1          | Order            | Order Qty (order)                                 |
| 17     | Q      | Balance Qty                                      | 1          | Order            | Balance Qty (order)                               |
| 18     | R      | Order Rate                                       | 1          | Order            | Order Rate (order)                                |
| 19     | S      | Total Value                                      | 1          | Order            | Total Value (order)                               |
| 20     | T      | LIMIT                                            | 1          | Order            | LIMIT (order)                                     |
| 21     | U      | Payment Terms                                    | 1          | Order processing | Payment Terms (order processing)                  |
| 22     | V      | Order Receiving Date & Time                      | 1          | Order processing | Order Receiving Date & Time (order processing)    |
| 23     | W      | Planned                                          | 1          | Order processing | Planned (order processing)                        |
| 24     | X      | Actual                                           | 1          | Order processing | Actual (order processing)                         |
| 25     | Y      | PO PHOTO                                         | 1          | Order processing | PO PHOTO (order processing)                       |
| 26     | Z      | Rev PO Photo                                     | 1          | Order processing | Rev PO Photo (order processing)                   |
| 27     | AA     | Time Delay                                       | 1          | Order processing | Time Delay (order processing)                     |
| 28     | AB     | Planned                                          | 2          | Order processing | Planned (order processing)                        |
| 29     | AC     | Actual                                           | 2          | Order processing | Actual (order processing)                         |
| 30     | AD     | Status                                           | 1          | Order processing | Status (order processing)                         |
| 31     | AE     | Time Delay (Auto) P                              | 1          | Order processing | Time Delay (Auto) P (order processing)            |
| 32     | AF     | Planned P                                        | 1          | Order processing | Planned P (order processing)                      |
| 33     | AG     | Actual P                                         | 1          | Order processing | Actual P (order processing)                       |
| 34     | AH     | Terms & Condition                                | 1          | Order processing | Terms & Condition (order processing)              |
| 35     | AI     | Size & Rate Approval                             | 1          | Order processing | Size & Rate Approval (order processing)           |
| 36     | AJ     | Material Status                                  | 1          | Order processing | Material Status (order processing)                |
| 37     | AK     | Lot NO.                                          | 1          | Order processing | Lot NO. (order processing)                        |
| 38     | AL     | CRDD                                             | 1          | Order processing | CRDD (order processing)                           |
| 39     | AM     | PO Approval Status                               | 1          | Order processing | PO Approval Status (order processing)             |
| 40     | AN     | Time Delay (Auto) P1                             | 1          | Order processing | Time Delay (Auto) P1 (order processing)           |
| 41     | AO     | Planned D                                        | 1          | Purchase         | Planned D (purchase)                              |
| 42     | AP     | Actual D                                         | 1          | Purchase         | Actual D (purchase)                               |
| 43     | AQ     | Status D                                         | 1          | Purchase         | Status D (purchase)                               |
| 44     | AR     | Time Delay (Auto) D                              | 1          | Purchase         | Time Delay (Auto) D (purchase)                    |
| 45     | AS     | Planned G                                        | 1          | Purchase         | Planned G (purchase)                              |
| 46     | AT     | Actual G                                         | 1          | Purchase         | Actual G (purchase)                               |
| 47     | AU     | Status G                                         | 1          | Purchase         | Status G (purchase)                               |
| 48     | AV     | Time Delay (Auto) G                              | 1          | Purchase         | Time Delay (Auto) G (purchase)                    |
| 49     | AW     | Purchase Target Date                             | 1          | Purchase         | Purchase Target Date (purchase)                   |
| 50     | AX     | Jindal Expected Date                             | 1          | Purchase         | Jindal Expected Date (purchase)                   |
| 51     | AY     | Job Work Expected Date                           | 1          | Purchase         | Job Work Expected Date (purchase)                 |
| 52     | AZ     | REVISED CRDD                                     | 1          | Purchase         | REVISED CRDD (purchase)                           |
| 53     | BA     | Planned PR                                       | 1          | Purchase         | Planned PR (purchase)                             |
| 54     | BB     | Actual PR                                        | 1          | Purchase         | Actual PR (purchase)                              |
| 55     | BC     | Status PR                                        | 1          | Purchase         | Status PR (purchase)                              |
| 56     | BD     | Time Delay (Auto) PR                             | 1          | Purchase         | Time Delay (Auto) PR (purchase)                   |
| 57     | BE     | Planned                                          | 3          | Dispatch         | Planned (dispatch)                                |
| 58     | BF     | Actual                                           | 3          | Dispatch         | Actual (dispatch)                                 |
| 59     | BG     | Dispatch Order link                              | 1          | Dispatch         | Dispatch Order link (dispatch)                    |
| 60     | BH     | Time Delay                                       | 2          | Dispatch         | Time Delay (dispatch)                             |
| 61     | BI     | Planned SG                                       | 1          | Dispatch         | Planned SG (dispatch)                             |
| 62     | BJ     | Actual SG                                        | 1          | Dispatch         | Actual SG (dispatch)                              |
| 63     | BK     | VEHICLE NUMBER                                   | 1          | Dispatch         | VEHICLE NUMBER (dispatch)                         |
| 64     | BL     | TRASPOTER NAME                                   | 1          | Dispatch         | TRASPOTER NAME (dispatch)                         |
| 65     | BM     | (blank)                                          | 1          | Dispatch         | Unnamed spacer; never written by this application |
| 66     | BN     | Remarks/ Challenges                              | 1          | Dispatch         | Remarks/ Challenges (dispatch)                    |
| 67     | BO     | Time Delay                                       | 3          | Dispatch         | Time Delay (dispatch)                             |
| 68     | BP     | Status                                           | 2          | Dispatch         | Status (dispatch)                                 |
| 69     | BQ     | Final Status TImestam[p                          | 1          | Dispatch         | Final Status TImestam[p (dispatch)                |
| 70     | BR     | Move status                                      | 1          | Dispatch         | Move status (dispatch)                            |
| 71     | BS     | Planned Dispatch Date                            | 1          | Invoice 1        | Planned Dispatch Date (invoice 1)                 |
| 72     | BT     | Qty Dispatched                                   | 1          | Invoice 1        | Qty Dispatched (invoice 1)                        |
| 73     | BU     | Dispatch Date                                    | 1          | Invoice 1        | Dispatch Date (invoice 1)                         |
| 74     | BV     | Invoice No.                                      | 1          | Invoice 1        | Invoice No. (invoice 1)                           |
| 75     | BW     | Invoice Date                                     | 1          | Invoice 1        | Invoice Date (invoice 1)                          |
| 76     | BX     | Invoice Value                                    | 1          | Invoice 1        | Invoice Value (invoice 1)                         |
| 77     | BY     | Invoice Due Date                                 | 1          | Invoice 1        | Invoice Due Date (invoice 1)                      |
| 78     | BZ     | Planned Dispatch Date                            | 2          | Invoice 2        | Planned Dispatch Date (invoice 2)                 |
| 79     | CA     | Qty Dispatched                                   | 2          | Invoice 2        | Qty Dispatched (invoice 2)                        |
| 80     | CB     | Dispatch Date                                    | 2          | Invoice 2        | Dispatch Date (invoice 2)                         |
| 81     | CC     | Invoice No.                                      | 2          | Invoice 2        | Invoice No. (invoice 2)                           |
| 82     | CD     | Invoice Date                                     | 2          | Invoice 2        | Invoice Date (invoice 2)                          |
| 83     | CE     | Invoice Value                                    | 2          | Invoice 2        | Invoice Value (invoice 2)                         |
| 84     | CF     | Invoice Due Date                                 | 2          | Invoice 2        | Invoice Due Date (invoice 2)                      |
| 85     | CG     | Planned Dispatch Date                            | 3          | Invoice 3        | Planned Dispatch Date (invoice 3)                 |
| 86     | CH     | Qty Dispatched                                   | 3          | Invoice 3        | Qty Dispatched (invoice 3)                        |
| 87     | CI     | Dispatch Date                                    | 3          | Invoice 3        | Dispatch Date (invoice 3)                         |
| 88     | CJ     | Invoice No.                                      | 3          | Invoice 3        | Invoice No. (invoice 3)                           |
| 89     | CK     | Invoice Date                                     | 3          | Invoice 3        | Invoice Date (invoice 3)                          |
| 90     | CL     | Invoice Value                                    | 3          | Invoice 3        | Invoice Value (invoice 3)                         |
| 91     | CM     | Invoice Due Date                                 | 3          | Invoice 3        | Invoice Due Date (invoice 3)                      |
| 92     | CN     | Planned Dispatch Date                            | 4          | Invoice 4        | Planned Dispatch Date (invoice 4)                 |
| 93     | CO     | Qty Dispatched                                   | 4          | Invoice 4        | Qty Dispatched (invoice 4)                        |
| 94     | CP     | Dispatch Date                                    | 4          | Invoice 4        | Dispatch Date (invoice 4)                         |
| 95     | CQ     | Invoice No.                                      | 4          | Invoice 4        | Invoice No. (invoice 4)                           |
| 96     | CR     | Invoice Date                                     | 4          | Invoice 4        | Invoice Date (invoice 4)                          |
| 97     | CS     | Invoice Value                                    | 4          | Invoice 4        | Invoice Value (invoice 4)                         |
| 98     | CT     | Invoice Due Date                                 | 4          | Invoice 4        | Invoice Due Date (invoice 4)                      |
| 99     | CU     | Planned Dispatch Date                            | 5          | Invoice 5        | Planned Dispatch Date (invoice 5)                 |
| 100    | CV     | Qty Dispatched                                   | 5          | Invoice 5        | Qty Dispatched (invoice 5)                        |
| 101    | CW     | Dispatch Date                                    | 5          | Invoice 5        | Dispatch Date (invoice 5)                         |
| 102    | CX     | Invoice No.                                      | 5          | Invoice 5        | Invoice No. (invoice 5)                           |
| 103    | CY     | Invoice Date                                     | 5          | Invoice 5        | Invoice Date (invoice 5)                          |
| 104    | CZ     | Invoice Value                                    | 5          | Invoice 5        | Invoice Value (invoice 5)                         |
| 105    | DA     | Invoice Due Date                                 | 5          | Invoice 5        | Invoice Due Date (invoice 5)                      |
| 106    | DB     | Planned Dispatch Date                            | 6          | Invoice 6        | Planned Dispatch Date (invoice 6)                 |
| 107    | DC     | Qty Dispatched                                   | 6          | Invoice 6        | Qty Dispatched (invoice 6)                        |
| 108    | DD     | Dispatch Date                                    | 6          | Invoice 6        | Dispatch Date (invoice 6)                         |
| 109    | DE     | Invoice No.                                      | 6          | Invoice 6        | Invoice No. (invoice 6)                           |
| 110    | DF     | Invoice Date                                     | 6          | Invoice 6        | Invoice Date (invoice 6)                          |
| 111    | DG     | Invoice Value                                    | 6          | Invoice 6        | Invoice Value (invoice 6)                         |
| 112    | DH     | Invoice Due Date                                 | 6          | Invoice 6        | Invoice Due Date (invoice 6)                      |
| 113    | DI     | Planned Dispatch Date                            | 7          | Invoice 7        | Planned Dispatch Date (invoice 7)                 |
| 114    | DJ     | Qty Dispatched                                   | 7          | Invoice 7        | Qty Dispatched (invoice 7)                        |
| 115    | DK     | Dispatch Date                                    | 7          | Invoice 7        | Dispatch Date (invoice 7)                         |
| 116    | DL     | Invoice No.                                      | 7          | Invoice 7        | Invoice No. (invoice 7)                           |
| 117    | DM     | Invoice Date                                     | 7          | Invoice 7        | Invoice Date (invoice 7)                          |
| 118    | DN     | Invoice Value                                    | 7          | Invoice 7        | Invoice Value (invoice 7)                         |
| 119    | DO     | Invoice Due Date                                 | 7          | Invoice 7        | Invoice Due Date (invoice 7)                      |
| 120    | DP     | Planned Dispatch Date                            | 8          | Invoice 8        | Planned Dispatch Date (invoice 8)                 |
| 121    | DQ     | Qty Dispatched                                   | 8          | Invoice 8        | Qty Dispatched (invoice 8)                        |
| 122    | DR     | Dispatch Date                                    | 8          | Invoice 8        | Dispatch Date (invoice 8)                         |
| 123    | DS     | Invoice No.                                      | 8          | Invoice 8        | Invoice No. (invoice 8)                           |
| 124    | DT     | Invoice Date                                     | 8          | Invoice 8        | Invoice Date (invoice 8)                          |
| 125    | DU     | Invoice Value                                    | 8          | Invoice 8        | Invoice Value (invoice 8)                         |
| 126    | DV     | Invoice Due Date                                 | 8          | Invoice 8        | Invoice Due Date (invoice 8)                      |
| 127    | DW     | Planned Dispatch Date                            | 9          | Invoice 9        | Planned Dispatch Date (invoice 9)                 |
| 128    | DX     | Qty Dispatched                                   | 9          | Invoice 9        | Qty Dispatched (invoice 9)                        |
| 129    | DY     | Dispatch Date                                    | 9          | Invoice 9        | Dispatch Date (invoice 9)                         |
| 130    | DZ     | Invoice No.                                      | 9          | Invoice 9        | Invoice No. (invoice 9)                           |
| 131    | EA     | Invoice Date                                     | 9          | Invoice 9        | Invoice Date (invoice 9)                          |
| 132    | EB     | Invoice Value                                    | 9          | Invoice 9        | Invoice Value (invoice 9)                         |
| 133    | EC     | Invoice Due Date                                 | 9          | Invoice 9        | Invoice Due Date (invoice 9)                      |
| 134    | ED     | Planned Dispatch Date                            | 10         | Invoice 10       | Planned Dispatch Date (invoice 10)                |
| 135    | EE     | Qty Dispatched                                   | 10         | Invoice 10       | Qty Dispatched (invoice 10)                       |
| 136    | EF     | Dispatch Date                                    | 10         | Invoice 10       | Dispatch Date (invoice 10)                        |
| 137    | EG     | Invoice No.                                      | 10         | Invoice 10       | Invoice No. (invoice 10)                          |
| 138    | EH     | Invoice Date                                     | 10         | Invoice 10       | Invoice Date (invoice 10)                         |
| 139    | EI     | Invoice Value                                    | 10         | Invoice 10       | Invoice Value (invoice 10)                        |
| 140    | EJ     | Invoice Due Date                                 | 10         | Invoice 10       | Invoice Due Date (invoice 10)                     |

Invoice occurrences 1?10 are displayed in the detail drawer. The primary register uses business field groups rather than showing all invoice columns. All edits are physical-column specific, revalidated and batched.
