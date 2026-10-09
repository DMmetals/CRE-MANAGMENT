import { useEffect, useRef, useState } from 'react';
import { X, Save, LockKeyhole } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { O2DField, O2DRow, O2DMeta, O2DData } from '@cre/shared';
import { StepCard } from './StepCard';
import { request } from '../enquiries/api';
const tabs = [
  'Overview',
  'Process Status',
  'Purchase',
  'Dispatch',
  'Invoice History',
  'Activity',
] as const;
interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  record: string;
  field: string;
  oldValue: string;
  newValue: string;
}
const sectionFor: Record<string, string> = {
  Overview: 'Order',
  'Process Status': 'Order processing',
  Purchase: 'Purchase',
  Dispatch: 'Dispatch',
};
export function O2DDetail({
  row: initialRow,
  branch,
  onClose,
  onSaved,
}: {
  row: O2DRow;
  branch: 'FBD' | 'MUM';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [row, setRow] = useState(initialRow);
  const client = useQueryClient();
  const [uploading, setUploading] = useState<'PO' | 'REVISED_PO' | null>(null);
  const [notice, setNotice] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [tab, setTab] = useState<string>('Overview');
  const [changes, setChanges] = useState<Record<number, string>>({});
  const [saving, setBusy] = useState(false);
  const busy = saving || uploading !== null;
  const [error, setError] = useState('');
  const audit = useQuery({
    queryKey: ['o2d-activity', branch, row.enquiryNo, row.srNo],
    queryFn: () =>
      request<AuditEntry[]>(
        `/api/o2d/${branch.toLowerCase()}/activity?enquiryNo=${encodeURIComponent(row.enquiryNo)}&srNo=${encodeURIComponent(row.srNo)}`,
      ),
    enabled: tab === 'Activity',
  });
  const metadata = useQuery({
    queryKey: ['o2d-meta', branch, row.id],
    queryFn: () =>
      request<O2DMeta>(
        `/api/o2d/${branch.toLowerCase()}/meta?rowId=${encodeURIComponent(row.id)}`,
      ),
    enabled: ['Process Status', 'Purchase', 'Dispatch'].includes(tab),
    staleTime: 0,
  });
  const layout = metadata.data?.stepLayout;
  useEffect(() => {
    const fresh = metadata.data?.row;
    if (!fresh || fresh.version === row.version) return;
    if (
      fresh.id !== row.id ||
      fresh.enquiryNo !== row.enquiryNo ||
      fresh.srNo !== row.srNo ||
      fresh.sku !== row.sku
    ) {
      setRefreshRequired(true);
      setError('The material changed. Close and refresh the register.');
      return;
    }
    if (
      Object.entries(changes).some(
        ([column, value]) =>
          value !==
          (row.fields.find((f) => f.column === Number(column))?.inputValue ??
            row.fields.find((f) => f.column === Number(column))?.value),
      )
    ) {
      setRefreshRequired(true);
      setError(
        'This material changed while you were editing. Refresh before saving.',
      );
      return;
    }
    setRow(fresh);
  }, [metadata.data]);
  async function refreshWorkflowRow() {
    const data = await request<O2DData>(
      `/api/o2d/${branch.toLowerCase()}/enquiries/${encodeURIComponent(row.enquiryNo)}`,
    );
    const matches = data.rows.filter(
      (r) =>
        r.id === row.id &&
        r.enquiryNo === row.enquiryNo &&
        r.srNo === row.srNo &&
        r.sku === row.sku,
    );
    if (matches.length !== 1)
      throw new Error(
        'The material moved or changed. Close and refresh the register.',
      );
    setRow(matches[0]!);
    setRefreshRequired(false);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['orders'] }),
      client.invalidateQueries({
        queryKey: ['o2d-activity', branch, row.enquiryNo, row.srNo],
      }),
      client.invalidateQueries({ queryKey: ['o2d-meta', branch, row.id] }),
    ]);
  }

  async function upload(file: File, type: 'PO' | 'REVISED_PO') {
    setError('');
    setNotice('');
    setUploading(type);
    try {
      if (file.size === 0 || file.size > 10 * 1024 * 1024)
        throw new Error('Choose a non-empty PO file no larger than 10 MB.');
      if (
        !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ||
        !/\.(pdf|jpe?g|png)$/i.test(file.name)
      )
        throw new Error('Choose a PDF, JPG, JPEG or PNG file.');
      const body = new FormData();
      body.append('enquiryNo', row.enquiryNo);
      body.append('srNo', row.srNo);
      body.append('type', type);
      body.append('version', row.version);
      body.append('file', file);
      const result = await request<{
        url: string;
        row?: O2DRow;
        refreshRequired: boolean;
      }>(
        `/api/o2d/${branch.toLowerCase()}/rows/${encodeURIComponent(row.id)}/po`,
        { method: 'POST', body },
      );
      if (result.row) setRow(result.row);
      setRefreshRequired(result.refreshRequired);
      setNotice(
        type === 'PO'
          ? 'PO uploaded successfully.'
          : 'Revised PO uploaded successfully.',
      );
      if (result.refreshRequired)
        setError(
          'The file was saved. Close and refresh this material before making more changes.',
        );
      await Promise.all([
        client.invalidateQueries({ queryKey: ['orders'] }),
        client.invalidateQueries({
          queryKey: ['o2d-activity', branch, row.enquiryNo, row.srNo],
        }),
        client.invalidateQueries({ queryKey: ['o2d-meta', branch, row.id] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload this PO.');
    } finally {
      setUploading(null);
    }
  }
  const close = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  const pending = Object.entries(changes).filter(
    ([column, value]) =>
      (row.fields.find((f) => f.column === Number(column))?.inputValue ??
        row.fields.find((f) => f.column === Number(column))?.value) !== value,
  );
  async function save() {
    const savingWorkflow =
      ['Process Status', 'Purchase', 'Dispatch'].includes(tab) ||
      pending.some(([column]) =>
        layout?.steps.some((step) =>
          step.fields.some((field) => field.column === Number(column)),
        ),
      );
    if (savingWorkflow) setNotice('');
    setBusy(true);
    setError('');
    try {
      const result = await request<{
        updatedRows: number;
        protectedFields: string[];
      }>(
        `/api/o2d/${branch.toLowerCase()}/rows/${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: row.version,
            enquiryNo: row.enquiryNo,
            srNo: row.srNo,
            ...(savingWorkflow ? { sku: row.sku, context: 'workflow' } : {}),
            changes: pending.map(([column, value]) => ({
              column: Number(column),
              value,
            })),
          }),
        },
      );
      if (savingWorkflow) {
        try {
          await refreshWorkflowRow();
        } catch (e) {
          setRefreshRequired(true);
          setError(
            `The save completed, but refreshed values could not be loaded. ${e instanceof Error ? e.message : 'Retry refresh before editing again.'}`,
          );
          return;
        }
        if (result.protectedFields.length) {
          setError(
            `These Sheet fields were protected and could not be changed: ${result.protectedFields.join(', ')}.`,
          );
        } else {
          setChanges({});
          setNotice('Changes saved. Values refreshed from Google Sheets.');
        }
        return;
      }
      if (result.protectedFields.length) {
        setError(
          `These Sheet fields were protected and could not be changed: ${result.protectedFields.join(', ')}. Refresh the register before editing again.`,
        );
        return;
      }
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save these changes.',
      );
    } finally {
      setBusy(false);
    }
  }
  function fields(items: O2DField[]) {
    return (
      <div className="crm-fields o2d-fields">
        {items
          .filter((f) => f.header.trim())
          .map((field) => {
            const value =
              changes[field.column] ?? field.inputValue ?? field.value;
            const readonly = !field.editable || field.protected;
            return (
              <label key={field.column}>
                <span>{field.header.trim()}</span>
                {field.protected && (
                  <small className="o2d-protected">
                    <LockKeyhole size={11} /> Sheet formula / protected
                  </small>
                )}
                <input
                  aria-label={`${field.section}: ${field.header}`}
                  type="text"
                  value={value}
                  readOnly={readonly}
                  disabled={busy || refreshRequired}
                  onChange={(e) => {
                    if (!readonly)
                      setChanges((old) => ({
                        ...old,
                        [field.column]: e.target.value,
                      }));
                  }}
                />
                {readonly && !field.protected && (
                  <small className="o2d-readonly">Read only</small>
                )}
              </label>
            );
          })}
      </div>
    );
  }
  function workflowTab() {
    if (metadata.isPending)
      return <p className="crm-muted">Loading Sheet workflow...</p>;
    if (metadata.isError || !layout)
      return (
        <p className="crm-error" role="alert">
          {metadata.error?.message || 'Sheet workflow could not be loaded.'}{' '}
          <button className="crm-reset" onClick={() => void metadata.refetch()}>
            Retry
          </button>
        </p>
      );
    return (
      <>
        {!layout.writesEnabled && (
          <p className="crm-note">
            Sheet writes are disabled. Workflow fields are available to view.
          </p>
        )}
        {layout.warnings
          .filter((warning) =>
            warning.startsWith('Order Verification validation differs'),
          )
          .map((warning) => (
            <p key={warning} className="crm-note">
              {warning}
            </p>
          ))}
        {refreshRequired && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refreshWorkflowRow();
                setError('');
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Could not refresh this material.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh material
          </button>
        )}
        {layout.steps
          .filter((step) => step.tab === tab)
          .map((step) => (
            <StepCard
              key={step.key}
              step={step}
              branch={branch}
              row={row}
              changes={changes}
              disabled={busy || refreshRequired || !layout.writesEnabled}
              uploading={uploading}
              onChange={(column, value) =>
                setChanges((old) => ({ ...old, [column]: value }))
              }
              onUpload={(file, type) => void upload(file, type)}
            />
          ))}
      </>
    );
  }
  const activities = row.fields.filter(
    (field) =>
      field.value && /actual|timestamp|order receiving/i.test(field.header),
  );
  return (
    <div className="crm-modal-backdrop">
      <section
        className="crm-detail o2d-detail"
        ref={drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="o2d-detail-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Tab') {
            const focusable = drawer.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
            );
            if (!focusable?.length) return;
            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <div className="eyebrow">
              O2D {branch} / MATERIAL {row.srNo}
            </div>
            <h2 id="o2d-detail-title">{row.enquiryNo}</h2>
            <p>
              {row.customer} · {row.sku}
            </p>
          </div>
          <button
            ref={close}
            className="icon-button"
            aria-label="Close material details"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div
          className="crm-view-tabs o2d-tabs"
          role="tablist"
          aria-label="Material details"
        >
          {tabs.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'selected' : ''}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="crm-form-body">
          {notice && (
            <p className="o2d-upload-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="crm-error" role="alert">
              {error}
            </p>
          )}
          {['Process Status', 'Purchase', 'Dispatch'].includes(tab) ? (
            workflowTab()
          ) : tab === 'Invoice History' ? (
            <>
              <h3>Dispatch &amp; Invoice History</h3>
              <p className="crm-muted">
                Each block is a separate dispatch or invoice entry from the
                Sheet.
              </p>
              {row.invoiceHistory.length ? (
                row.invoiceHistory.map((invoice) => (
                  <details
                    className="o2d-invoice"
                    key={invoice.occurrence}
                    open={Boolean(
                      invoice.invoiceNo ||
                      invoice.dispatchDate ||
                      invoice.qtyDispatched,
                    )}
                  >
                    <summary>
                      Dispatch / Invoice {invoice.occurrence}
                      {invoice.invoiceNo
                        ? ` · ${invoice.invoiceNo}`
                        : ' · No invoice recorded'}
                    </summary>
                    {fields(invoice.fields)}
                  </details>
                ))
              ) : (
                <p className="crm-muted">
                  No dispatch or invoice blocks are available.
                </p>
              )}
            </>
          ) : tab === 'Activity' ? (
            <>
              <h3>Activity log</h3>
              {audit.isPending ? (
                <p className="crm-muted">Loading activity...</p>
              ) : audit.isError ? (
                <p className="crm-error" role="alert">
                  {audit.error.message}
                  <button
                    className="crm-reset"
                    onClick={() => void audit.refetch()}
                  >
                    Retry
                  </button>
                </p>
              ) : audit.data.length ? (
                <ol className="o2d-activity">
                  {audit.data.map((entry, i) => (
                    <li key={`${entry.timestamp}-${i}`}>
                      <strong>
                        {entry.action}
                        {entry.field ? ` - ${entry.field}` : ''}
                      </strong>
                      <span>
                        {entry.timestamp}
                        {entry.user ? ` - ${entry.user}` : ''}
                      </span>
                      {(entry.oldValue || entry.newValue) && (
                        <span>
                          {entry.oldValue || 'Blank'} to{' '}
                          {entry.newValue || 'Blank'}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="crm-muted">
                  No audit entries recorded for this material.
                </p>
              )}
              <h3>Recorded timestamps</h3>
              {activities.length ? (
                <ol className="o2d-activity">
                  {activities.map((field) => (
                    <li key={field.column}>
                      <strong>
                        {field.section} · {field.header}
                      </strong>
                      <span>{field.value}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="crm-muted">
                  No activity timestamps are recorded for this material.
                </p>
              )}
              <p className="crm-muted">
                Activity shows timestamps recorded in the Sheet.
              </p>
            </>
          ) : (
            fields(
              row.fields.filter((field) => field.section === sectionFor[tab]),
            )
          )}
        </div>
        <footer className="crm-form-footer">
          <span>
            {pending.length
              ? `${pending.length} changed field${pending.length === 1 ? '' : 's'}`
              : 'Formula fields are read only.'}
          </span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              refreshRequired ||
              !pending.length ||
              (['Process Status', 'Purchase', 'Dispatch'].includes(tab) &&
                (!layout || metadata.isError || !layout.writesEnabled))
            }
            onClick={() => void save()}
          >
            <Save size={14} />
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </section>
    </div>
  );
}
