import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import type { O2DData, O2DRow } from '@cre/shared';
import { request } from '../enquiries/api';
import { O2DDetail } from './O2DDetail';
import '../enquiries/crm.css';
import './o2d.css';
export type OrderRow = O2DRow;
export type OrderData = O2DData;
type Column = [keyof O2DRow, string];
const identity: Column[] = [
  ['srNo', 'Sr no'],
  ['enquiryNo', 'Enquiry No.'],
  ['customer', 'Customer Name'],
];
const groups: Record<string, Column[]> = {
  Order: [
    ...identity,
    ['salesPerson', 'Sales Person'],
    ['category', 'Category'],
    ['poNumber', 'PO Number'],
    ['poDate', 'PO Date'],
    ['sku', 'SKU'],
    ['thickness', 'Thk'],
    ['width', 'Width'],
    ['length', 'Lgt'],
    ['finish', 'Finish'],
    ['grade', 'Grade'],
    ['edge', 'Edge'],
    ['nos', 'Nos'],
    ['qty', 'Order Qty'],
    ['balance', 'Balance Qty'],
    ['rate', 'Order Rate'],
    ['totalValue', 'Total Value'],
    ['limit', 'LIMIT'],
  ],
  'Order processing': [
    ...identity,
    ['sku', 'SKU'],
    ['paymentTerms', 'Payment Terms'],
    ['receivingDate', 'Order Receiving Date & Time'],
    ['processStatus', 'Status'],
    ['termsCondition', 'Terms & Condition'],
    ['sizeRateApproval', 'Size & Rate Approval'],
    ['materialStatus', 'Material Status'],
    ['lotNo', 'Lot NO.'],
    ['crdd', 'CRDD'],
    ['approval', 'PO Approval Status'],
  ],
  Purchase: [
    ...identity,
    ['sku', 'SKU'],
    ['statusD', 'Status D'],
    ['statusG', 'Status G'],
    ['purchaseTargetDate', 'Purchase Target Date'],
    ['jindalExpectedDate', 'Jindal Expected Date'],
    ['jobWorkExpectedDate', 'Job Work Expected Date'],
    ['revisedCrdd', 'REVISED CRDD'],
    ['statusPr', 'Status PR'],
  ],
  Dispatch: [
    ...identity,
    ['sku', 'SKU'],
    ['dispatchLink', 'Dispatch Order link'],
    ['vehicleNumber', 'VEHICLE NUMBER'],
    ['transporter', 'TRASPOTER NAME'],
    ['remarks', 'Remarks/ Challenges'],
    ['status', 'Final Status'],
    ['finalStatusTimestamp', 'Final Status Timestamp'],
    ['moveStatus', 'Move status'],
  ],
};
const textValue = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
export function O2DPage({ branch }: { branch: 'FBD' | 'MUM' }) {
  const query = useQuery({
    queryKey: ['orders', branch],
    queryFn: () => request<O2DData>(`/api/o2d/${branch.toLowerCase()}`),
    refetchInterval: 60000,
  });
  const [params, setParams] = useSearchParams();
  const enquiry = params.get('enquiry') ?? '';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [customer, setCustomer] = useState('');
  const [sales, setSales] = useState('');
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('Order');
  const [selected, setSelected] = useState<O2DRow | null>(null);
  const rows = query.data?.rows ?? [];
  const filtered = rows.filter(
    (r) =>
      (!enquiry || r.enquiryNo === enquiry) &&
      (!category || r.category === category) &&
      (!customer || r.customer === customer) &&
      (!sales || r.salesPerson === sales) &&
      (!status || r.status === status) &&
      [
        r.enquiryNo,
        r.customer,
        r.sku,
        r.poNumber,
        r.lotNo,
        r.vehicleNumber,
        r.transporter,
        ...r.invoiceHistory.map((i) => i.invoiceNo),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const columns = groups[group]!;
  function reset() {
    setSearch('');
    setCategory('');
    setCustomer('');
    setSales('');
    setStatus('');
    setParams((p) => {
      p.delete('enquiry');
      return p;
    });
  }
  return (
    <>
      <div className="crm-toolbar">
        <div>
          <h1>Order to Delivery — {branch}</h1>
          <p className="crm-muted">
            Track enquiries, material processing, purchase and dispatch.
          </p>
        </div>
        <div className="crm-actions">
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw size={14} />{' '}
            {query.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link
            className="button secondary"
            to={category === 'NBD' ? '/nbd' : '/crr'}
          >
            Back to Enquiries
          </Link>
          <Link
            className="button primary"
            to={`/dispatch/${branch.toLowerCase()}${enquiry ? `?enquiry=${encodeURIComponent(enquiry)}` : ''}`}
          >
            Create Dispatch Order
          </Link>
        </div>
      </div>
      {query.data?.warning && <p className="crm-note">{query.data.warning}</p>}
      <div className="crm-kpis">
        {[
          [
            'Total orders',
            new Set(rows.map((r) => r.enquiryNo).filter(Boolean)).size,
          ],
          ['Total materials', rows.length],
          ['Total order qty', rows.reduce((n, r) => n + (r.qty ?? 0), 0)],
          ['Total balance qty', rows.reduce((n, r) => n + (r.balance ?? 0), 0)],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>
              {query.isPending || query.isError
                ? '—'
                : Number(value).toLocaleString('en-IN')}
            </strong>
            {label === 'Total orders' && <span>Unique enquiry numbers</span>}
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="crm-filters">
          <div className="crm-search">
            <Search size={15} />
            <input
              aria-label="Search O2D"
              placeholder="Enquiry, customer, SKU, PO, lot, vehicle, invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {[
            {
              label: 'Category',
              value: category,
              set: setCategory,
              key: 'category',
            },
            {
              label: 'Sales person',
              value: sales,
              set: setSales,
              key: 'salesPerson',
            },
            {
              label: 'Customer',
              value: customer,
              set: setCustomer,
              key: 'customer',
            },
            {
              label: 'Final status',
              value: status,
              set: setStatus,
              key: 'status',
            },
          ].map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {[
                ...new Set(
                  rows.map((r) => String(r[f.key as keyof O2DRow] ?? '')),
                ),
              ]
                .filter(Boolean)
                .sort()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          ))}
          <button className="crm-reset" onClick={reset}>
            Reset
          </button>
        </div>
        {enquiry && (
          <div className="o2d-filter-note">
            Showing enquiry <strong>{enquiry}</strong>
            <button
              className="crm-reset"
              onClick={() =>
                setParams((p) => {
                  p.delete('enquiry');
                  return p;
                })
              }
            >
              Show all enquiries
            </button>
          </div>
        )}
        <div
          className="crm-view-tabs o2d-tabs"
          role="tablist"
          aria-label="O2D column groups"
        >
          {Object.keys(groups).map((name) => (
            <button
              role="tab"
              aria-selected={group === name}
              key={name}
              className={group === name ? 'selected' : ''}
              onClick={() => setGroup(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {query.isPending ? (
          <div className="crm-loading">Loading live O2D materials…</div>
        ) : query.isError ? (
          <div className="crm-error" role="alert">
            {query.error.message}
            <button
              className="button secondary"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !filtered.length ? (
          <div className="crm-loading">
            {rows.length
              ? 'No materials match these filters.'
              : 'No materials transferred yet. Open a Won enquiry and select Transfer to O2D.'}
          </div>
        ) : (
          <div className="crm-table-scroll">
            <table className="crm-table o2d-table">
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="o2d-row"
                    onClick={() => setSelected(row)}
                  >
                    {columns.map(([key]) => (
                      <td key={key} title={textValue(row[key])}>
                        {key === 'srNo' ? (
                          <button
                            className="crm-record-link"
                            aria-label={`Open ${row.enquiryNo} material ${row.srNo}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(row);
                            }}
                          >
                            {row.srNo || '—'}
                          </button>
                        ) : key === 'dispatchLink' &&
                          typeof row[key] === 'string' &&
                          /^https?:\/\//i.test(row[key]) ? (
                          <a
                            href={row[key]}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open PDF
                          </a>
                        ) : (
                          textValue(row[key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="crm-pagination">
          {filtered.length} of {rows.length} material rows
          <span>Click a material to view details and invoice history.</span>
        </div>
      </section>
      <p className="crm-data-note">
        Google Sheets is the source of truth. Refreshes every minute.
      </p>
      {selected && (
        <O2DDetail
          key={selected.id}
          row={selected}
          branch={branch}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void query.refetch();
          }}
        />
      )}
    </>
  );
}
