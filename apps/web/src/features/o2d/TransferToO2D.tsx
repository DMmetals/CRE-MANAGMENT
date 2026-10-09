import { normalizeBranch } from '@cre/shared';
import { useEffect, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { EnquiryMaterial, EnquiryType, O2DData } from '@cre/shared';
import { request } from '../enquiries/api';
import './o2d.css';
type Branch = 'FBD' | 'MUM';
interface TransferResult {
  writesEnabled?: boolean;
  eligible?: boolean;
  blockingReasons?: string[];
  destination: Branch;
  spreadsheetId: string;
  sheetName: string;
  enquiryNo: string;
  transferred: number;
  skippedDuplicates: number;
  srNos: number[];
  rowsToInsert: {
    srNo: number;
    sourceId: string;
    fields: Record<string, string | number>;
  }[];
  protectedFields: string[];
  previewToken: string;
}
export function TransferToO2D({
  rows,
  type,
  onTransferred,
  compact = false,
  onlyBranch,
}: {
  rows: EnquiryMaterial[];
  type: EnquiryType;
  onTransferred?: () => void;
  compact?: boolean;
  onlyBranch?: Branch;
}) {
  const client = useQueryClient();
  const enquiryNo = rows[0]?.enquiryNo ?? '';
  const won = rows.filter((r) => r.status.trim().toUpperCase() === 'WON');
  const branches = [
    ...new Set(
      rows
        .map((r) => normalizeBranch(r.branch))
        .filter(
          (b): b is Branch =>
            (b === 'FBD' || b === 'MUM') && (!onlyBranch || b === onlyBranch),
        ),
    ),
  ];
  const status = useQueries({
    queries: branches.map((branch) => ({
      queryKey: ['o2d-transfer-status', type, enquiryNo, branch],
      queryFn: () =>
        request<O2DData>(
          `/api/o2d/${branch.toLowerCase()}?enquiryNo=${encodeURIComponent(enquiryNo)}&category=${type}`,
        ),
      staleTime: 15000,
      enabled: !compact,
    })),
  });
  const [preview, setPreview] = useState<TransferResult | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLElement>(null);
  const hasTransferred = status.some((q) =>
    q.data?.rows?.some((r) => r.enquiryNo === enquiryNo && r.category === type),
  );
  useEffect(() => {
    if (hasTransferred) onTransferred?.();
  }, [hasTransferred, onTransferred]);
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus();
  }, [preview]);
  async function action(branch: Branch, transfer: boolean) {
    setBusy(true);
    setError('');
    try {
      const value = await request<TransferResult>(
        `/api/o2d/transfer${transfer ? '' : '/preview'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            enquiryNo,
            branch,
            ...(transfer ? { previewToken: preview?.previewToken } : {}),
          }),
        },
      );
      if (value.eligible === false)
        throw new Error(
          value.blockingReasons?.join(' ') || 'No eligible Won material found.',
        );
      if (!transfer) setPreview(value);
      else {
        setResult(value);
        setPreview(null);
        onTransferred?.();
        await Promise.all([
          client.invalidateQueries({ queryKey: ['orders'] }),
          client.invalidateQueries({ queryKey: ['o2d-transfer-status'] }),
          client.invalidateQueries({ queryKey: ['enquiries', type] }),
        ]);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not transfer this enquiry.',
      );
      if (transfer) setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {won.length > 0 && (
        <div className="o2d-transfer-actions">
          {branches
            .filter((b) => won.some((r) => normalizeBranch(r.branch) === b))
            .map((branch) => {
              const materials = won.filter(
                (r) => normalizeBranch(r.branch) === branch,
              );
              const anyEligible = materials.some(
                (r) => r.poNumber.trim() && r.remarks.trim(),
              );
              const missingPO =
                !anyEligible && materials.some((r) => !r.poNumber.trim());
              const missingRemarks =
                !anyEligible && materials.some((r) => !r.remarks.trim());
              return (
                <div key={branch}>
                  <button
                    className={compact ? 'crm-record-link' : 'button secondary'}
                    disabled={busy || missingPO || missingRemarks}
                    onClick={() => void action(branch, false)}
                  >
                    {busy ? 'Checking transfer…' : `Transfer to O2D ${branch}`}
                  </button>
                  {missingPO && (
                    <p className="field-error">
                      PO Number is required before transferring to O2D.
                    </p>
                  )}
                  {missingRemarks && (
                    <p className="field-error">
                      Remarks are required before transferring to O2D.
                    </p>
                  )}
                </div>
              );
            })}
          {won.some(
            (r) => !['FBD', 'MUM'].includes(normalizeBranch(r.branch)),
          ) && (
            <p className="field-error">
              A Won material must have Branch FBD or MUM before transferring to
              O2D.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="crm-error" role="alert">
          {error}
        </p>
      )}
      {result ? (
        <div className="o2d-transfer-status" role="status">
          <strong>
            {result.transferred
              ? 'Order transferred successfully.'
              : 'These materials are already in O2D.'}{' '}
            Transferred to O2D {result.destination}
          </strong>
          <p>
            Enquiry No: {result.enquiryNo}
            <br />
            Materials transferred: {result.transferred}
            <br />
            Sr Nos: {result.srNos.join(', ') || '—'}
            <br />
            Duplicates skipped: {result.skippedDuplicates}
          </p>
          <Link
            to={`/o2d/${result.destination.toLowerCase()}?enquiry=${encodeURIComponent(result.enquiryNo)}`}
          >
            Open O2D {result.destination}
          </Link>
        </div>
      ) : (
        status.map((q, i) => {
          const existing =
            q.data?.rows?.filter(
              (r) => r.enquiryNo === enquiryNo && r.category === type,
            ) ?? [];
          return existing.length ? (
            <div key={branches[i]} className="o2d-transfer-status">
              <strong>O2D status: Transferred to O2D {branches[i]}</strong>
              <p>
                Enquiry No: {enquiryNo}
                <br />
                Materials: {existing.length} · Sr Nos:{' '}
                {existing.map((r) => r.srNo).join(', ')}
              </p>
              <Link
                to={`/o2d/${branches[i]!.toLowerCase()}?enquiry=${encodeURIComponent(enquiryNo)}`}
              >
                Open O2D
              </Link>
            </div>
          ) : null;
        })
      )}
      {status.some((q) => q.isError) && (
        <p className="crm-muted">
          Could not check existing O2D transfers.{' '}
          <button
            className="crm-reset"
            onClick={() => {
              status.forEach((q) => void q.refetch());
            }}
          >
            Retry status
          </button>
        </p>
      )}
      {preview && (
        <div className="crm-modal-backdrop o2d-confirm-backdrop">
          <section
            ref={confirm}
            className="o2d-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="o2d-transfer-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !busy) {
                e.stopPropagation();
                setPreview(null);
              }
              if (e.key === 'Tab') {
                const items = confirm.current?.querySelectorAll<HTMLElement>(
                  'button:not(:disabled),summary',
                );
                if (!items?.length) return;
                const first = items[0]!;
                const last = items[items.length - 1]!;
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
            <h2 id="o2d-transfer-title">Confirm transfer to O2D</h2>
            {preview.writesEnabled === false && (
              <p className="crm-error" role="alert">
                Sheet writes are disabled. Preview is available; enable Sheet
                writes before transferring.
              </p>
            )}
            <dl>
              <dt>Enquiry</dt>
              <dd>{preview.enquiryNo}</dd>
              <dt>Destination</dt>
              <dd>O2D {preview.destination}</dd>
              <dt>Won materials</dt>
              <dd>
                {
                  won.filter(
                    (r) =>
                      normalizeBranch(r.branch) === preview.destination &&
                      !!r.poNumber.trim() &&
                      !!r.remarks.trim(),
                  ).length
                }
              </dd>
              <dt>PO Number</dt>
              <dd>
                {[
                  ...new Set(
                    won
                      .filter(
                        (r) =>
                          normalizeBranch(r.branch) === preview.destination &&
                          !!r.poNumber.trim() &&
                          !!r.remarks.trim(),
                      )
                      .map((r) => r.poNumber),
                  ),
                ].join(', ')}
              </dd>
              <dt>Materials to transfer</dt>
              <dd>{preview.transferred}</dd>
              <dt>Sr Nos</dt>
              <dd>{preview.srNos.join(', ') || '—'}</dd>
              <dt>Duplicates to skip</dt>
              <dd>{preview.skippedDuplicates}</dd>
            </dl>
            {preview.protectedFields.length > 0 && (
              <p className="crm-note">
                Sheet formulas preserved: {preview.protectedFields.join(', ')}
              </p>
            )}
            <details>
              <summary>Review fields to write</summary>
              {preview.rowsToInsert.map((row) => (
                <div className="o2d-preview-fields" key={row.sourceId}>
                  <strong>Material {row.srNo}</strong>
                  {Object.entries(row.fields).map(([name, value]) => (
                    <div key={name}>
                      {name}: {String(value)}
                    </div>
                  ))}
                </div>
              ))}
            </details>
            <div className="crm-actions">
              <button
                ref={cancel}
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || preview.writesEnabled === false}
                onClick={() => void action(preview.destination, true)}
              >
                {busy ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
