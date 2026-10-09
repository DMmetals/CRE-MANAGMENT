import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { TransferToO2D } from '../o2d/TransferToO2D';
import type { EnquiryType } from '@cre/shared';
import type { EnquiryMaterial } from '@cre/shared';
import { ExternalLink, X } from 'lucide-react';
export function EnquiryDetail({
  rows,
  type,
  onClose,
}: {
  rows: EnquiryMaterial[];
  type: EnquiryType;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [transferred, setTransferred] = useState(false);
  const first = rows[0]!;
  const quote = rows.some((r) => r.quoteUrl);
  const won = rows.some(
    (r) => r.status.trim().toLowerCase() === 'won' && r.poNumber && r.remarks,
  );
  const order = transferred;
  return (
    <div className="crm-modal-backdrop">
      <section
        className="crm-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <header>
          <div>
            <div className="eyebrow">ENQUIRY DETAILS</div>
            <h2 id="detail-title">{first.enquiryNo}</h2>
            <p>{first.customer}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close enquiry details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="crm-form-body">
          <div className="crm-actions">
            <button
              className="button primary"
              onClick={() =>
                navigate(
                  `/quotation/${type.toLowerCase()}?enquiry=${encodeURIComponent(first.enquiryNo)}`,
                )
              }
            >
              Generate Quotation
            </button>
          </div>
          <TransferToO2D
            rows={rows}
            type={type}
            onTransferred={() => setTransferred(true)}
          />
          <div className="crm-steps">
            {[
              ['Enquiry', true],
              ['Quotation', quote],
              ['Won / PO', won],
              ['O2D', order],
              ['Dispatch', false],
            ].map(([name, complete], i) => (
              <div className={complete ? 'complete' : ''} key={String(name)}>
                <span>{i + 1}</span>
                <strong>{name}</strong>
                <small>
                  {complete
                    ? 'Recorded'
                    : name === 'Dispatch'
                      ? 'Not linked'
                      : 'Pending'}
                </small>
              </div>
            ))}
          </div>
          <div className="crm-detail-grid">
            {[
              ['Customer', first.customer],
              ['Sales person', first.salesPerson],
              ['Branch', first.branch],
              ['Date', first.date],
              ['Contact', first.purchaser],
              ['Phone', first.phone],
              ['Email', first.email],
              ['State', first.state],
            ].map(([name, value]) => (
              <div key={name}>
                <small>{name}</small>
                <strong>{value || '?'}</strong>
              </div>
            ))}
          </div>
          <h3>Materials ({rows.length})</h3>
          <div className="crm-table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  {[
                    'SKU',
                    'Qty',
                    'Rate',
                    'Status',
                    'PO number',
                    'Quotation',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.sku}</td>
                    <td>{row.qty ?? '?'}</td>
                    <td>{row.rate ?? '?'}</td>
                    <td>{row.status}</td>
                    <td>{row.poNumber || '?'}</td>
                    <td>
                      {row.quoteUrl ? (
                        <a href={row.quoteUrl} target="_blank" rel="noreferrer">
                          Open quotation <ExternalLink size={12} />
                        </a>
                      ) : (
                        'Not generated'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Commercial notes</h3>
          {rows.map(
            (row) =>
              row.remarks && (
                <p className="crm-note" key={row.rowNumber}>
                  <strong>{row.sku}</strong>
                  {row.remarks}
                </p>
              ),
          )}
          {!rows.some((r) => r.remarks) && (
            <p className="crm-muted">No remarks recorded.</p>
          )}
          <p className="crm-muted">
            Progress is derived from recorded enquiry and O2D fields.
          </p>
        </div>
      </section>
    </div>
  );
}
