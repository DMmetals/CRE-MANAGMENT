import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EnquiryMaterial, EnquiryType } from '@cre/shared';
import { request } from './api';
export function EditRow({
  row,
  type,
  onClose,
  onSaved,
}: {
  row: EnquiryMaterial;
  type: EnquiryType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const customers = useQuery({
    queryKey: ['customers', type],
    queryFn: () => request<string[]>(`/api/customers/${type}`),
  });
  const sales = useQuery({
    queryKey: ['sales-persons', type],
    queryFn: () =>
      request<{ options: string[] }>(`/api/meta/sales-persons/${type}`),
  });
  const options: Record<string, string[]> = {
    customer: customers.data ?? [],
    salesPerson: sales.data?.options ?? [],
    branch: ['FBD', 'MUM'],
    edge: ['ME', 'TE'],
    mode: ['Whatsapp', 'Mail'],
  };
  const keys = [
    'customer',
    'salesPerson',
    'branch',
    'sku',
    'edge',
    'qty',
    'orderQty',
    'limit',
    'mode',
    'rate',
    'status',
    'remarks',
    'poNumber',
  ] as const;
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(keys.map((k) => [k, String(row[k] ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const labels = {
    customer: 'Customer name',
    salesPerson: 'Sales person',
    branch: 'Branch',
    sku: 'SKU',
    edge: 'Edge',
    qty: 'Quantity',
    orderQty: 'Order quantity',
    limit: 'Limit',
    mode: 'Enquiry mode',
    rate: 'Rate',
    status: 'Won / Loss',
    remarks: 'Remarks',
    poNumber: 'PO number',
  };
  async function save() {
    setError('');
    setBusy(true);
    try {
      const changes = Object.fromEntries(
        keys
          .filter((k) => draft[k] !== String(row[k] ?? ''))
          .map((k) => [
            k,
            ['qty', 'orderQty', 'rate'].includes(k)
              ? Number(draft[k])
              : draft[k],
          ]),
      );
      if (!Object.keys(changes).length) {
        onClose();
        return;
      }
      const result = await request<{ protectedFields: string[] }[]>(
        `/api/enquiries/${type}/rows/${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: row.version,
            updatedAt: row.updatedAt,
            changes,
          }),
        },
      );
      if (result.some((r) => r.protectedFields.length)) {
        setError(
          'Saved manual fields. Protected fields were skipped: ' +
            result.flatMap((r) => r.protectedFields).join(', '),
        );
      } else onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="crm-modal-backdrop">
      <section
        className="crm-form-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Edit material"
      >
        <header>
          <h2>Edit material / {row.enquiryNo}</h2>
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>
        <div className="crm-form-body">
          <div className="crm-fields">
            {keys.map((key) => (
              <label key={key}>
                {labels[key]}
                {options[key] ? (
                  <select
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  >
                    <option value="">Select {labels[key]}</option>
                    {!options[key]!.includes(draft[key] ?? '') &&
                      draft[key] && (
                        <option disabled value={draft[key]}>
                          {draft[key]} (existing)
                        </option>
                      )}
                    {options[key]!.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : key === 'status' ? (
                  <select
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  >
                    {[
                      ...new Set([
                        row.status,
                        'Pending',
                        'Negotiation',
                        'Won',
                        'Loss',
                        'Regret',
                      ]),
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      ['qty', 'orderQty', 'rate'].includes(key)
                        ? 'number'
                        : 'text'
                    }
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          {row.id.includes(':row:') && (
            <p className="crm-error">
              This historical record has no DB_ID. It must receive a verified
              stable identity before saving.
            </p>
          )}
          {error && (
            <p className="crm-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="crm-form-footer">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save row'}
          </button>
        </footer>
      </section>
    </div>
  );
}
