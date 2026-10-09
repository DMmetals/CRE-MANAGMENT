import { DriveConnection } from './DriveConnection';
import { parseApiResponse } from '../../api/response';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { EnquiryType } from '@cre/shared';
import { loadRegister, request } from '../enquiries/api';
export function QuotationPage({ type }: { type: EnquiryType }) {
  const [params] = useSearchParams();
  const client = useQueryClient();
  const [enquiry, setEnquiry] = useState(params.get('enquiry') ?? '');
  const [company, setCompany] = useState('DM');
  const [rates, setRates] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState<Record<string, string>>({
    NOTE: 'JINDAL MAKE',
    Delivery: '03 to 05 Days',
    'G.S.T.': '18% EXTRA',
    Payment: 'Against Delivery',
    'Packing & Forwarding': 'Extra',
    Transportation: 'Extra',
    Validity: '1 Day',
    'Prepared by': 'Vikram Chandan',
    'Closing message':
      'We trust you will find our above offer most competitive and await your valued order',
    'Sign-off': 'Thanks & Regards,',
  });
  const [notes, setNotes] = useState('');
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ url: string; count: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const data = useQuery({
    queryKey: ['enquiries', type],
    queryFn: () => loadRegister(type),
  });
  const rows = data.data?.rows.filter((r) => r.enquiryNo === enquiry) ?? [];
  const payload = () => ({
    type,
    enquiryNo: enquiry,
    company,
    notes,
    terms,
    materials: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      updatedAt: r.updatedAt,
      version: r.version,
      rate: Number(rates[r.id] ?? r.rate ?? 0),
    })),
  });
  async function action(kind: string) {
    if (busy) return;
    setError('');
    setSaved(null);
    if (
      rows.some((r) => {
        const value = rates[r.id] ?? r.rate;
        return (
          value == null ||
          String(value).trim() === '' ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        );
      })
    ) {
      setError(
        'Enter a valid rate for every material before generating the quotation.',
      );
      return;
    }
    setBusy(true);
    try {
      if (kind === 'save-and-download' || kind === 'pdf') {
        const response = await fetch(`/api/quotations/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
          signal: AbortSignal.timeout(120000),
        });
        if (
          !response.ok ||
          !response.headers.get('Content-Type')?.includes('application/pdf')
        ) {
          const body = parseApiResponse<unknown>(
            response,
            await response.text(),
          );
          throw new Error(
            !body.success
              ? body.error.message
              : 'The server did not return a PDF.',
          );
        }
        const blob = await response.blob();
        if (!blob.size)
          throw new Error(
            'The PDF response was empty. Refresh the register before retrying.',
          );
        const savedUrl = response.headers.get('X-Quotation-Url');
        if (kind === 'save-and-download') {
          if (!savedUrl)
            throw new Error(
              'The server did not confirm the saved PDF link. Refresh before retrying.',
            );
          setSaved({
            url: savedUrl,
            count: Number(
              response.headers.get('X-Updated-Rows') ?? rows.length,
            ),
          });
          void client.invalidateQueries({ queryKey: ['enquiries', type] });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Quotation_${enquiry.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const result = await request<{ html?: string }>(
          `/api/quotations/${kind}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload()),
          },
        );
        if (result.html) setHtml(result.html);
      }
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Could not reach the application server. Refresh the register to check whether the quotation was saved before retrying.'
          : e instanceof Error && e.name === 'TimeoutError'
            ? 'The request timed out. Check the register for the saved quotation before retrying.'
            : e instanceof Error
              ? e.message
              : 'Action failed',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{type} Quotation</h2>
        <span>DM / MM</span>
      </div>
      <div className="crm-form-body">
        <DriveConnection />
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="crm-fields">
            <label>
              Enquiry
              <select
                value={enquiry}
                onChange={(e) => {
                  setEnquiry(e.target.value);
                  setHtml('');
                  setRates({});
                  setSaved(null);
                  setError('');
                }}
              >
                <option value="">Select an enquiry</option>
                {[...new Set(data.data?.rows.map((r) => r.enquiryNo))].map(
                  (no) => (
                    <option key={no}>{no}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Quotation company
              <select
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setSaved(null);
                  setHtml('');
                }}
              >
                <option>DM</option>
                <option>MM</option>
              </select>
            </label>
          </div>
          {data.isPending && <p>Loading enquiries...</p>}
          {data.isError && <p role="alert">{data.error.message}</p>}
          {rows.length > 0 && (
            <>
              <h3>{rows[0]!.customer}</h3>
              <div className="crm-table-scroll">
                <table className="crm-table">
                  <thead>
                    <tr>
                      {[
                        'SKU',
                        'THK',
                        'Width',
                        'Length',
                        'Finish',
                        'Grade',
                        'Edge',
                        'Qty',
                        'Limit',
                        'Rate',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const parts = r.sku.split('-');
                      return (
                        <tr key={r.id}>
                          <td>{r.sku}</td>
                          {[
                            r.thickness ?? parts[0],
                            r.width ?? parts[1],
                            r.length ?? parts[2],
                            r.finish ?? parts[3],
                            r.grade ?? parts.slice(4).join('-'),
                            r.edge,
                            r.qty,
                            r.limit,
                          ].map((v, i) => (
                            <td key={i}>{v}</td>
                          ))}
                          <td>
                            <input
                              aria-label={`Rate for ${r.sku}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={rates[r.id] ?? r.rate ?? ''}
                              onChange={(e) => {
                                setRates({ ...rates, [r.id]: e.target.value });
                                setSaved(null);
                                setHtml('');
                              }}
                              style={{ width: 85 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <h3>Quotation terms</h3>
              <p>Edit these details before previewing or saving your PDF.</p>
              <div className="crm-fields">
                {Object.entries(terms).map(([name, value]) => (
                  <label
                    key={name}
                    className={
                      name === 'Closing message' ? 'span-two' : undefined
                    }
                  >
                    {name === 'NOTE'
                      ? 'Note / make'
                      : name === 'G.S.T.'
                        ? 'GST'
                        : name}
                    <input
                      value={value}
                      maxLength={500}
                      onChange={(event) => {
                        setTerms({ ...terms, [name]: event.target.value });
                        setHtml('');
                        setSaved(null);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label>
                Additional notes
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setSaved(null);
                    setHtml('');
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    margin: '12px 0',
                    border: '1px solid #ccd6e3',
                    padding: 10,
                  }}
                />
              </label>
              <p>
                Saving uploads the PDF and updates the rate and quotation link
                for these materials in {type}.
              </p>
              <div className="crm-actions">
                {[
                  ['preview', 'Preview quotation'],
                  ['save-and-download', 'Save & download PDF'],
                  ['email', 'Email PDF'],
                ].map(([kind, label]) => (
                  <button
                    className={`button ${kind === 'save-and-download' ? 'primary' : 'secondary'}`}
                    key={kind}
                    disabled={busy}
                    onClick={() => void action(kind!)}
                  >
                    {busy && kind === 'save-and-download'
                      ? 'Working...'
                      : label}
                  </button>
                ))}
              </div>
            </>
          )}
        </fieldset>
        {saved && (
          <p role="status" className="connection-banner">
            Quotation saved. Updated {saved.count} material row(s) in {type}.{' '}
            <a href={saved.url} target="_blank" rel="noreferrer">
              Open saved PDF
            </a>
          </p>
        )}
        {error && (
          <p className="crm-error" role="alert">
            {error}
          </p>
        )}
        {html && (
          <iframe
            title="Quotation preview"
            sandbox=""
            srcDoc={html}
            style={{
              width: '100%',
              height: 680,
              border: '1px solid #dde4ed',
              marginTop: 20,
            }}
          />
        )}
      </div>
    </section>
  );
}
