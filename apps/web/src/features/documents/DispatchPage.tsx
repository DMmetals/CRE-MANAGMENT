import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DispatchCompany,
  DispatchMaterials,
  DispatchOverrides,
  DispatchPreview,
  DispatchSaved,
} from '@cre/shared';
import { request } from '../enquiries/api';
import { parseApiResponse } from '../../api/response';
import './dispatch.css';
const money = (v: string) =>
  Number(v).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function DispatchPage({ branch }: { branch: 'FBD' | 'MUM' }) {
  const [params] = useSearchParams(),
    client = useQueryClient();
  const [enquiry, setEnquiry] = useState(params.get('enquiry') ?? '');
  const [selected, setSelected] = useState<string[] | null>(null);
  const [overrides, setOverrides] = useState<DispatchOverrides>({});
  const [review, setReview] = useState<DispatchPreview | null>(null),
    [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<DispatchSaved | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const [email, setEmail] = useState({
    to: '',
    cc: '',
    subject: '',
    message: 'Please find attached Dispatch Order PDF.',
  });
  const [requestIds, setRequestIds] = useState({
    save: crypto.randomUUID(),
    email: crypto.randomUUID(),
  });
  const endpoint = `/api/dispatch/${branch.toLowerCase()}`;
  const enquiries = useQuery({
    queryKey: ['dispatch-enquiries', branch],
    queryFn: () => request<{ enquiries: string[] }>(`${endpoint}/enquiries`),
  });
  const materials = useQuery({
    queryKey: ['dispatch-materials', branch, enquiry],
    queryFn: () =>
      request<DispatchMaterials>(
        `${endpoint}/enquiries/${encodeURIComponent(enquiry)}/materials`,
      ),
    enabled: !!enquiry,
  });
  const preselected =
    selected !== null
      ? selected
      : params.get('enquiry') === enquiry &&
          params.get('sr') &&
          materials.data?.rows.some(
            (r) => r.srNo === params.get('sr') && r.approved,
          )
        ? [params.get('sr')!]
        : [];
  const srNos = preselected;
  const versions = Object.fromEntries(
    (materials.data?.rows ?? [])
      .filter((r) => srNos.includes(r.srNo))
      .map((r) => [r.srNo, r.version]),
  );
  const base = useQuery({
    queryKey: ['dispatch-base', branch, enquiry, srNos, versions],
    enabled: srNos.length > 0 && !!materials.data,
    queryFn: () =>
      request<DispatchPreview>(`${endpoint}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryNo: enquiry, srNos, versions }),
      }),
    retry: false,
  });
  const preview = review ?? base.data;
  const document = preview?.document;
  const validPreview = !!preview && !dirty && !base.isFetching;
  function reset() {
    setOverrides({});
    setReview(null);
    setDirty(false);
    setSaved(null);
    setError('');
    setRequestIds({ save: crypto.randomUUID(), email: crypto.randomUUID() });
  }
  function change(key: keyof DispatchOverrides, value: string) {
    setOverrides((o) => ({ ...o, [key]: value }));
    setDirty(true);
    setSaved(null);
    setRequestIds({ save: crypto.randomUUID(), email: crypto.randomUUID() });
  }
  function editable(
    key: keyof DispatchOverrides,
    label: string,
    multiline = false,
    type = 'text',
  ) {
    const value = String(overrides[key] ?? document?.[key] ?? '');
    return (
      <label key={key}>
        <span>{label}</span>
        {multiline ? (
          <textarea
            value={value}
            rows={3}
            onChange={(e) => change(key, e.target.value)}
            disabled={!!busy}
          />
        ) : (
          <input
            type={type}
            onClick={(e) => {
              if (type === 'date') {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* Native calendar remains available. */
                }
              }
            }}
            step={type === 'number' ? '0.01' : undefined}
            min={type === 'number' ? 0 : undefined}
            value={value}
            onChange={(e) => change(key, e.target.value)}
            disabled={!!busy}
          />
        )}
      </label>
    );
  }
  function readonly(
    company: DispatchCompany,
    keys: [keyof DispatchCompany, string][],
  ) {
    return keys.map(([key, label]) => (
      <label key={key}>
        <span>{label}</span>
        <input value={company[key]} readOnly />
      </label>
    ));
  }
  async function action(kind: 'preview' | 'pdf' | 'save' | 'email') {
    setBusy(kind);
    setError('');
    const payload = {
      enquiryNo: enquiry,
      srNos,
      versions,
      overrides,
      ...(kind !== 'preview' ? { fingerprint: preview?.fingerprint } : {}),
      ...(['save', 'email'].includes(kind)
        ? { requestId: requestIds[kind as 'save' | 'email'] }
        : {}),
      ...(kind === 'email'
        ? {
            email: {
              ...email,
              to: email.to || materials.data?.emailTo || '',
              subject: email.subject || `Dispatch Order - ${enquiry}`,
            },
          }
        : {}),
    };
    try {
      if (kind === 'pdf') {
        const response = await fetch(`${endpoint}/pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const result = parseApiResponse<unknown>(
            response,
            await response.text(),
          );
          throw new Error(
            result.success ? 'PDF download failed.' : result.error.message,
          );
        }
        const url = URL.createObjectURL(await response.blob());
        const a = window.document.createElement('a');
        a.href = url;
        a.download =
          /filename="([^"]+)"/.exec(
            response.headers.get('Content-Disposition') ?? '',
          )?.[1] ?? preview!.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (kind === 'preview') {
        const result = await request<DispatchPreview>(`${endpoint}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setReview(result);
        setDirty(false);
      } else {
        const result = await request<DispatchSaved>(`${endpoint}/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSaved(result);
        await Promise.all([
          client.invalidateQueries({ queryKey: ['orders'] }),
          client.invalidateQueries({ queryKey: ['o2d-meta'] }),
          client.invalidateQueries({
            queryKey: ['dispatch-materials', branch, enquiry],
          }),
        ]);
        const fresh = await materials.refetch();
        if (fresh.error)
          throw new Error(
            'The dispatch was saved, but materials could not refresh. Use Open PDF and reload before another action.',
          );
        const nextVersions = Object.fromEntries(
          (fresh.data?.rows ?? [])
            .filter((r) => srNos.includes(r.srNo))
            .map((r) => [r.srNo, r.version]),
        );
        const next = await request<DispatchPreview>(`${endpoint}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enquiryNo: enquiry,
            srNos,
            versions: nextVersions,
            overrides,
          }),
        });
        setReview(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch action failed.');
    } finally {
      setBusy('');
    }
  }
  const warnings = [
    ...new Set([
      ...(materials.data?.warnings ?? []),
      ...(document?.warnings ?? []),
    ]),
  ];
  return (
    <section className="panel dispatch-builder">
      <div className="panel-heading">
        <div>
          <h2>Dispatch Order Builder / {branch}</h2>
          <p className="crm-muted">
            Create a dispatch document for approved enquiry materials.
          </p>
        </div>
        <Link
          className="button secondary"
          to={`/o2d/${branch.toLowerCase()}${enquiry ? `?enquiry=${encodeURIComponent(enquiry)}` : ''}`}
        >
          Back to O2D
        </Link>
      </div>
      <div className="crm-form-body">
        <div className="crm-fields">
          <label>
            <span>Enquiry Number</span>
            <select
              value={enquiry}
              disabled={!!busy}
              onChange={(e) => {
                setEnquiry(e.target.value);
                setSelected([]);
                setEmail({
                  to: '',
                  cc: '',
                  subject: '',
                  message: 'Please find attached Dispatch Order PDF.',
                });
                reset();
              }}
            >
              <option value="">Choose an approved enquiry</option>
              {enquiry && !enquiries.data?.enquiries.includes(enquiry) && (
                <option value={enquiry}>{enquiry}</option>
              )}
              {enquiries.data?.enquiries.map((no) => (
                <option key={no}>{no}</option>
              ))}
            </select>
          </label>
        </div>
        {enquiries.isPending && (
          <p className="crm-muted">Loading eligible enquiries...</p>
        )}
        {enquiries.data && !enquiries.data.enquiries.length && (
          <p className="crm-note">
            No approved enquiries are available. Set the relevant material's
            Step 8 Status to Approved in O2D.
          </p>
        )}
        {[enquiries.error, materials.error, base.error]
          .filter(Boolean)
          .map((e, i) => (
            <p key={i} role="alert" className="crm-error">
              {e?.message}
            </p>
          ))}
        {enquiry && (
          <section className="dispatch-section">
            <h3>Select material serial numbers</h3>
            {materials.isPending ? (
              <p>Loading materials...</p>
            ) : (
              materials.data?.rows.map((r) => (
                <label
                  className="dispatch-material-choice"
                  key={r.srNo + '-' + r.sku}
                >
                  <input
                    type="checkbox"
                    checked={srNos.includes(r.srNo)}
                    disabled={!r.approved || !!busy}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...srNos, r.srNo]
                        : srNos.filter((sr) => sr !== r.srNo);
                      setSelected(next);
                      reset();
                    }}
                  />
                  <span>
                    Sr {r.srNo} / {r.customer} / {r.sku}
                  </span>
                  <small>
                    {r.approved
                      ? 'Approved'
                      : `Not eligible: ${r.approval || 'approval pending'}`}
                  </small>
                </label>
              ))
            )}
          </section>
        )}
        {base.isFetching && (
          <p className="crm-muted">Loading document and party details...</p>
        )}
        {warnings.map((w) => (
          <p className="crm-note" key={w}>
            {w}
          </p>
        ))}
        {document && srNos.length > 0 && (
          <>
            <section className="dispatch-section">
              <h3>Company</h3>
              <div className="crm-fields">
                {readonly(document, [
                  ['companyName', 'Company Name'],
                  ['companyHO', 'Head Office Address'],
                  ['companyContact', 'Company Contact'],
                  ['batch', 'Batch'],
                  ['companyGSTIN', 'Company GSTIN'],
                  ['dispatchFromAddress', 'Dispatch From Address'],
                ])}
              </div>
            </section>
            <section className="dispatch-section">
              <h3>Order details</h3>
              <div className="crm-fields">
                {editable('date', 'Date', false, 'date')}
                {editable('termsOfPayment', 'Terms of Payment')}
                {editable('poRefNo', 'PO / Ref No')}
                {editable('termsOfDelivery', 'Terms of Delivery')}
                {editable('deliveryLocation', 'Delivery Location')}
              </div>
            </section>
            <div className="dispatch-party-grid">
              <section className="dispatch-section">
                <h3>Consignee / Ship To</h3>
                <div className="dispatch-stack">
                  {editable('shipToName', 'Ship To Name')}
                  {editable('shipToAddress', 'Ship To Address', true)}
                  {editable('shipGSTIN', 'Ship To GSTIN')}
                </div>
              </section>
              <section className="dispatch-section">
                <h3>Buyer / Bill To</h3>
                <div className="dispatch-stack">
                  {editable('billToName', 'Bill To Name')}
                  {editable('billToAddress', 'Bill To Address', true)}
                  {editable('billGSTIN', 'Bill To GSTIN')}
                </div>
              </section>
            </div>
            <section className="dispatch-section">
              <h3>Bank details</h3>
              <div className="crm-fields">
                {readonly(document, [
                  ['bankDetails', 'Bank Details / Account Name'],
                  ['bankName', 'Bank Name'],
                  ['accountNo', 'Account No.'],
                  ['branchName', 'Branch Name'],
                ])}
              </div>
            </section>
            <section className="dispatch-section">
              <h3>Transport</h3>
              <div className="crm-fields">
                {editable('vehicleNumber', 'Vehicle Number')}
                <label>
                  <span>Transporter Name</span>
                  <select
                    disabled={!!busy}
                    value={
                      overrides.transporterName ?? document.transporterName
                    }
                    onChange={(e) => change('transporterName', e.target.value)}
                  >
                    <option value="">Select transporter</option>
                    {materials.data?.transporters.map((t) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Transporter GSTIN</span>
                  <input
                    readOnly
                    value={
                      materials.data?.transporters.find(
                        (t) =>
                          t.name ===
                          (overrides.transporterName ??
                            document.transporterName),
                      )?.gstin ?? ''
                    }
                  />
                </label>
              </div>
            </section>
            <section className="dispatch-section">
              <h3>Materials</h3>
              <div className="dispatch-table-wrap">
                <table className="dispatch-lines">
                  <thead>
                    <tr>
                      {[
                        'SR',
                        'LOT NO.',
                        'GRADE',
                        'FINISH',
                        'THK',
                        'WID',
                        'LGT',
                        'NOS',
                        'Qty (Kgs)',
                        'Unit price',
                        'Total price',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {document.lines.map((l) => (
                      <tr key={l.srNo}>
                        {[
                          l.srNo,
                          l.lotNo,
                          l.grade,
                          l.finish,
                          l.thk,
                          l.wid,
                          l.lgt,
                          l.nos,
                          l.qty,
                          money(l.unitPrice),
                          money(l.totalPrice),
                        ].map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="crm-muted">
                Quantity: Order Qty. Material details and rates come from the
                selected O2D rows.
              </p>
            </section>
            <section className="dispatch-section">
              <h3>Summary</h3>
              <div className="crm-fields">
                {editable('otherCharges', 'Other Charges', false, 'number')}
                {editable(
                  'pkgLoading',
                  'Pkg. & Loading Charges',
                  false,
                  'number',
                )}
                {editable('gstRate', 'GST %', false, 'number')}
              </div>
              <dl className="dispatch-totals">
                {(
                  [
                    'totalQty',
                    'goodsTotal',
                    'taxableTotal',
                    'gstAmount',
                    'grandTotal',
                  ] as const
                ).map((key, i) => (
                  <div key={key}>
                    <dt>
                      {
                        [
                          'Total Qty (Kgs)',
                          'Goods Total',
                          'Taxable Total',
                          'GST Amount',
                          'Grand Total',
                        ][i]
                      }
                    </dt>
                    <dd>
                      {key === 'totalQty'
                        ? document[key]
                        : money(document[key])}
                    </dd>
                  </div>
                ))}
              </dl>
              {dirty && (
                <p className="crm-note">
                  Preview to recalculate totals and review your latest changes.
                </p>
              )}
            </section>
            <section className="dispatch-section">
              <h3>Terms & Conditions</h3>
              <div className="dispatch-stack">
                {editable('termsText', 'Terms & Conditions', true)}
                {editable('footerText', 'Footer')}
              </div>
            </section>
            <section className="dispatch-section">
              <h3>Email</h3>
              <div className="crm-fields">
                {(['to', 'cc', 'subject', 'message'] as const).map((k, i) => (
                  <label key={k}>
                    <span>{['To', 'Cc', 'Subject', 'Message'][i]}</span>
                    <input
                      disabled={!!busy}
                      value={
                        email[k] ||
                        (k === 'to'
                          ? (materials.data?.emailTo ?? '')
                          : k === 'subject'
                            ? `Dispatch Order - ${enquiry}`
                            : '')
                      }
                      onChange={(e) => {
                        setEmail((v) => ({ ...v, [k]: e.target.value }));
                        setRequestIds((v) => ({
                          ...v,
                          email: crypto.randomUUID(),
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              {!materials.data?.emailReady && (
                <p className="crm-muted">
                  An authorized sender must be configured before sending email.
                </p>
              )}
            </section>
            <div className="crm-actions dispatch-actions">
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => void action('preview')}
              >
                Preview
              </button>
              <button
                className="button secondary"
                disabled={!!busy || !validPreview}
                onClick={() => void action('pdf')}
              >
                Download PDF
              </button>
              <button
                className="button primary"
                disabled={
                  !!busy ||
                  !validPreview ||
                  !materials.data?.writesEnabled ||
                  !!saved
                }
                onClick={() => void action('save')}
              >
                Save Dispatch Order
              </button>
              <button
                className="button secondary"
                disabled={
                  !!busy ||
                  !validPreview ||
                  !materials.data?.writesEnabled ||
                  !materials.data?.emailReady ||
                  saved?.emailSent
                }
                onClick={() => void action('email')}
              >
                Send Email
              </button>
            </div>
            {busy && (
              <p role="status">
                {busy === 'preview'
                  ? 'Building preview...'
                  : busy === 'pdf'
                    ? 'Generating PDF...'
                    : busy === 'email'
                      ? 'Saving PDF and sending email...'
                      : 'Saving Dispatch Order...'}
              </p>
            )}
            {saved && (
              <p className="o2d-upload-notice" role="status">
                Dispatch Order saved successfully
                {saved.emailSent ? ' and email sent' : ''}.{' '}
                <a href={saved.url} target="_blank" rel="noopener noreferrer">
                  Open PDF
                </a>
              </p>
            )}
            {preview && !dirty && (
              <iframe
                title="Dispatch preview"
                sandbox=""
                srcDoc={preview.html}
                className="dispatch-preview"
              />
            )}
          </>
        )}
        {error && (
          <p className="crm-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
