import { normalizeBranch } from '@cre/shared';
import { TransferToO2D } from '../o2d/TransferToO2D';
import { useNavigate } from 'react-router-dom';
import { EditRow } from './EditRow';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { EnquiryMaterial, EnquiryType } from '@cre/shared';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { loadRegister, loadConfig } from './api';
import { CreateEnquiry } from './CreateEnquiry';
import { EnquiryDetail } from './EnquiryDetail';
import './crm.css';
export function EnquiryCRM({ type }: { type: EnquiryType }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EnquiryMaterial | null>(null);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['enquiries', type],
    queryFn: () => loadRegister(type),
    refetchInterval: 60000,
  });
  const config = useQuery({
    queryKey: ['enquiry-config'],
    queryFn: loadConfig,
  });
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [sales, setSales] = useState('');
  const [status, setStatus] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'register' | 'customers'>('register');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'rowNumber', desc: true },
  ]);
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!branch ||
            normalizeBranch(row.branch) === normalizeBranch(branch)) &&
          (!sales || row.salesPerson === sales) &&
          (!status || row.status === status) &&
          [
            row.enquiryNo,
            row.customer,
            row.sku,
            row.salesPerson,
            row.poNumber,
            row.remarks,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [rows, branch, sales, status, search],
  );
  const columns = useMemo<ColumnDef<EnquiryMaterial>[]>(
    () => [
      {
        id: 'edit',
        header: 'Action',
        size: 85,
        cell: (ctx) => (
          <button
            className="crm-record-link"
            onClick={() => setEditing(ctx.row.original)}
          >
            Edit row
          </button>
        ),
      },
      { accessorKey: 'rowNumber', header: '#', size: 55 },
      {
        accessorKey: 'enquiryNo',
        header: 'Enquiry no.',
        size: 155,
        cell: (ctx) => (
          <button
            className="crm-record-link"
            onClick={() => setSelected(ctx.row.original.enquiryNo)}
          >
            {String(ctx.getValue())}
          </button>
        ),
      },
      { accessorKey: 'date', header: 'Date', size: 110 },
      { accessorKey: 'customer', header: 'Customer', size: 240 },
      { accessorKey: 'salesPerson', header: 'Sales person', size: 140 },
      { accessorKey: 'branch', header: 'Branch', size: 80 },
      { accessorKey: 'sku', header: 'SKU', size: 210 },
      { accessorKey: 'edge', header: 'Edge', size: 65 },
      { accessorKey: 'qty', header: 'Qty', size: 85 },
      { accessorKey: 'limit', header: 'Limit', size: 100 },
      { accessorKey: 'mode', header: 'Enq mode', size: 110 },
      { accessorKey: 'rate', header: 'Rate', size: 85 },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
        cell: (ctx) => (
          <span
            className={`crm-status ${String(ctx.getValue())
              .toLowerCase()
              .replace(/[^a-z]/g, '')}`}
          >
            {String(ctx.getValue())}
          </span>
        ),
      },
      { accessorKey: 'poNumber', header: 'PO number', size: 140 },
      { accessorKey: 'remarks', header: 'Remarks', size: 240 },
      {
        id: 'transfer',
        header: 'O2D transfer',
        size: 200,
        cell: (ctx) => {
          const material = ctx.row.original;
          const destination = normalizeBranch(material.branch);
          if (
            material.status.trim().toUpperCase() !== 'WON' ||
            !material.poNumber.trim() ||
            !material.remarks.trim()
          )
            return null;
          if (destination !== 'FBD' && destination !== 'MUM')
            return (
              <span className="field-error">
                Unsupported branch: {material.branch || '(blank)'}
              </span>
            );
          return (
            <TransferToO2D
              compact
              onlyBranch={destination}
              type={type}
              rows={rows.filter((r) => r.enquiryNo === material.enquiryNo)}
            />
          );
        },
      },
      {
        accessorKey: 'quoteUrl',
        header: 'Quotation',
        size: 145,
        cell: (ctx) =>
          ctx.row.original.quoteUrl ? (
            <a
              href={ctx.row.original.quoteUrl}
              target="_blank"
              rel="noreferrer"
              className="crm-quote-link"
            >
              Open quotation <ExternalLink size={12} />
            </a>
          ) : (
            '?'
          ),
      },
    ],
    [rows, type],
  );
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    columnResizeMode: 'onChange',
  });
  const groups = new Map<string, EnquiryMaterial[]>();
  rows.forEach((row) =>
    groups.set(row.enquiryNo, [...(groups.get(row.enquiryNo) ?? []), row]),
  );
  const won = [...groups.values()].filter((items) =>
    items.some((r) => r.status.trim().toLowerCase() === 'won'),
  ).length;
  const open = [...groups.values()].filter((items) =>
    items.some(
      (r) => !['won', 'loss', 'regret'].includes(r.status.trim().toLowerCase()),
    ),
  ).length;
  const customers = [...new Set(filtered.map((row) => row.customer))].filter(
    Boolean,
  );
  function exportCsv() {
    const fields = [
      'enquiryNo',
      'customer',
      'salesPerson',
      'branch',
      'sku',
      'qty',
      'status',
      'poNumber',
      'remarks',
    ] as const;
    const escape = (value: unknown) =>
      '"' +
      String(value ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      fields.join(','),
      ...filtered.map((row) => fields.map((key) => escape(row[key])).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-enquiries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="crm-workspace">
      <div className="crm-toolbar">
        <div className="crm-view-tabs">
          <button
            className={view === 'register' ? 'selected' : ''}
            onClick={() => setView('register')}
          >
            Enquiry register
          </button>
          <button
            className={view === 'customers' ? 'selected' : ''}
            onClick={() => setView('customers')}
          >
            <Users size={14} />
            Customers
          </button>
        </div>
        <div className="crm-actions">
          <button
            className="button secondary"
            onClick={() => navigate(`/quotation/${type.toLowerCase()}`)}
          >
            Generate Quotation
          </button>
          <button
            className="button secondary"
            onClick={() => navigate('/o2d/fbd')}
          >
            O2D FBD
          </button>
          <button
            className="button secondary"
            onClick={() => navigate('/o2d/mum')}
          >
            O2D MUM
          </button>
          <button
            className="button secondary"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <Download size={14} />
            Export
          </button>
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              size={14}
              className={query.isFetching ? 'animate-spin' : ''}
            />
            Refresh data
          </button>
          <button
            className="button primary"
            disabled={
              !config.data?.canCreate || query.isPending || query.isError
            }
            onClick={() => setCreate(true)}
          >
            <Plus size={15} />
            Add enquiry
          </button>
        </div>
      </div>
      {notice && (
        <div className="crm-success" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="crm-kpis">
        {[
          ['Total enquiries', groups.size, 'Unique enquiry numbers'],
          ['Won enquiries', won, 'At least one won material'],
          ['Open enquiries', open, 'Materials awaiting a decision'],
          ['Total materials', rows.length, 'Individual material rows'],
        ].map(([label, value, note]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{query.isPending || query.isError ? '?' : value}</strong>
            <span>{note}</span>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="crm-filters">
          <label className="crm-search">
            <Search size={15} />
            <input
              aria-label="Search enquiries"
              placeholder="Search enquiry, customer, SKU, PO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Branch filter"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">All branches</option>
            {[...new Set(rows.map((r) => r.branch))]
              .filter(Boolean)
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
          <select
            aria-label="Sales person filter"
            value={sales}
            onChange={(e) => setSales(e.target.value)}
          >
            <option value="">All sales people</option>
            {[...new Set(rows.map((r) => r.salesPerson))]
              .filter(Boolean)
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[...new Set(rows.map((r) => r.status))].sort().map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <button
            className="crm-reset"
            onClick={() => {
              setSearch('');
              setBranch('');
              setSales('');
              setStatus('');
            }}
          >
            Reset
          </button>
        </div>
        {query.isPending ? (
          <div className="crm-loading" role="status">
            <RefreshCw className="animate-spin" size={22} />
            Loading your Google Sheets enquiries...
          </div>
        ) : query.isError ? (
          <div className="crm-error" role="alert">
            Could not load the register. {query.error.message}
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
              ? 'No enquiries match these filters.'
              : 'No enquiries recorded yet. Use Add enquiry to create the first one.'}
          </div>
        ) : view === 'customers' ? (
          <div className="crm-customer-list">
            {customers.map((name) => {
              const records = rows.filter((r) => r.customer === name);
              const latest = records.at(-1)!;
              return (
                <article key={name}>
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {[latest.salesPerson, latest.branch, latest.phone]
                        .filter(Boolean)
                        .join(' / ')}
                    </small>
                  </div>
                  <span>
                    {new Set(records.map((r) => r.enquiryNo)).size} enquiries
                  </span>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSearch(name);
                      setView('register');
                    }}
                  >
                    View enquiries
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <>
            <div className="crm-table-scroll">
              <table
                className="crm-table"
                style={{ width: table.getTotalSize() }}
              >
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{
                            width: header.getSize(),
                            position: 'relative',
                          }}
                        >
                          <button
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            <ArrowUpDown size={11} />
                          </button>
                          <div
                            className="crm-resize"
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                          />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="crm-pagination">
              <span>
                {filtered.length} materials /{' '}
                {new Set(filtered.map((r) => r.enquiryNo)).size} enquiries
              </span>
              <select
                aria-label="Rows per page"
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} rows
                  </option>
                ))}
              </select>
              <button
                aria-label="Previous page"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {Math.max(1, table.getPageCount())}
              </span>
              <button
                aria-label="Next page"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </section>
      <div className="crm-data-note">
        Google Sheets is the source of truth. Refreshes every minute.
        {query.data &&
          ` Last loaded ${new Date(query.data.fetchedAt).toLocaleTimeString()}.`}
      </div>
      {editing && (
        <EditRow
          row={editing}
          type={type}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void query.refetch();
            setNotice('Row saved.');
          }}
        />
      )}
      {create && config.data && (
        <CreateEnquiry
          type={type}
          date={config.data.date}
          onClose={() => setCreate(false)}
          onSaved={(number) => {
            setCreate(false);
            setNotice(`Enquiry ${number} saved successfully.`);
            void client.invalidateQueries({ queryKey: ['enquiries', type] });
          }}
        />
      )}
      {selected && groups.has(selected) && (
        <EnquiryDetail
          type={type}
          rows={groups.get(selected)!}
          onClose={() => setSelected('')}
        />
      )}
    </div>
  );
}
