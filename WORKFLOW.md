# CRE business workflow

Requirements-derived; legacy implementation has not yet been inspected.

Enquiry -> Quotation -> Won/PO -> O2D -> Dispatch Order -> Complete

1. **Enquiry**: backend business date, prefix C/N and April-March FY sequence allocated under a concurrency-safe lock. One enquiry groups multiple materials. Latest applicable customer details, SKU parsing, creation timestamp, DB_ID and LAST_EDIT_TS. Protect formulas including auto-managed ranges.
2. **Quotation**: select DM/MM, load exact enquiry materials, edit rates, preview A4 PDF, save to configured Drive folder. Update Rate and Quote Link only for selected stable material identities. Resolve GSTIN and company details from verified legacy configuration.
3. **Order confirmation**: require Won, nonempty PO Number and Remarks. Explain missing values; do not transfer other rows.
4. **O2D**: route FBD/MUM correctly. Keep the source Enquiry No, allocate sequential Sr Nos within that enquiry, category CRR/NBD, initial Balance Qty = Order Qty, current receiving timestamp. Prevent duplicate transfer using verified signature rules.
5. **Dispatch Order**: select Enquiry No + Sr Nos, enforce approvals and same-customer rules from legacy code. Resolve Bill To/Ship To from party master and transporter GSTIN from transporter master. Preview/save A4 PDF; update Dispatch Link only on exact selected Enquiry No + Sr No rows.
6. **Complete**: derive final state from verified business fields; do not equate PDF generation with completed physical delivery without a confirmed rule.

All future manual writes require authorization, formula checks, stable row identity, optimistic version checks and audit events. Google Sheets remains authoritative. Conflicts return HTTP 409. External Sheet editors do not participate in backend locks, so conflict limitations must be explicitly tested and documented.

Current implementation scope: read-only authentication, health and metadata. No enquiry, quotation, order or dispatch writes are enabled. Phase 2 remains gated on verified connection, legacy review and data dictionary.
