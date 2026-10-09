import { ExternalLink, LockKeyhole } from 'lucide-react';
import type { O2DRow, O2DWorkflowStep } from '@cre/shared';
import { POUploadField } from './POUploadField';
import { O2DSelectField } from './O2DSelectField';

export function StepCard({
  step,
  branch,
  row,
  changes,
  disabled,
  uploading,
  onChange,
  onUpload,
}: {
  step: O2DWorkflowStep;
  branch: 'FBD' | 'MUM';
  row: O2DRow;
  changes: Record<number, string>;
  disabled: boolean;
  uploading: 'PO' | 'REVISED_PO' | null;
  onChange: (column: number, value: string) => void;
  onUpload: (file: File, type: 'PO' | 'REVISED_PO') => void;
}) {
  return (
    <section
      className="o2d-workflow-card o2d-purchase-section"
      aria-labelledby={`o2d-${step.key}`}
    >
      <div className="o2d-purchase-heading">
        <h3 id={`o2d-${step.key}`} className="o2d-step-title">
          {step.stepNumber !== null && (
            <>
              <span className="o2d-step-badge">
                STEP {step.stepNumber}
              </span>{' '}
            </>
          )}
          {step.title}
        </h3>
        {(step.who || step.how || step.sla) && (
          <dl className="o2d-purchase-meta">
            {step.who && (
              <div>
                <dt>WHO</dt>
                <dd>{step.who}</dd>
              </div>
            )}
            {step.how && (
              <div>
                <dt>HOW</dt>
                <dd>{step.how}</dd>
              </div>
            )}
            {step.sla && (
              <div>
                <dt>SLA</dt>
                <dd>{step.sla}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="crm-fields o2d-fields">
        {step.fields.map((field) => {
          const readonly =
            !field.editable || field.protected || field.hasFormula;
          const date = field.inputType === 'date' && !readonly;
          const value =
            changes[field.column] ??
            (date ? (field.inputValue ?? '') : field.formattedValue);
          if (field.inputType === 'po' || field.inputType === 'revised-po') {
            const type = field.inputType === 'po' ? 'PO' : 'REVISED_PO';
            const current = row.fields.find((f) => f.column === field.column);
            return (
              <POUploadField
                key={field.key}
                field={{ ...field, value: current?.value ?? field.value }}
                revised={type === 'REVISED_PO'}
                disabled={disabled}
                uploading={uploading === type}
                onUpload={(file) => onUpload(file, type)}
              />
            );
          }
          if (field.inputType === 'dispatch-link')
            return (
              <div className="o2d-po-field" key={field.key}>
                <span>Dispatch Order</span>
                <div className="o2d-po-actions">
                  {row.dispatchLink && (
                    <a
                      className="button secondary"
                      href={row.dispatchLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={13} /> Open Dispatch Order
                    </a>
                  )}
                  <a
                    className="button secondary"
                    href={`/dispatch/${branch.toLowerCase()}?enquiry=${encodeURIComponent(row.enquiryNo)}&sr=${encodeURIComponent(row.srNo)}`}
                  >
                    Create Dispatch Order
                  </a>
                </div>
              </div>
            );
          return (
            <div className="o2d-field" key={field.key}>
              <label htmlFor={`o2d-field-${field.key}`} title={field.header}>
                {field.label}
              </label>
              {(field.hasFormula || field.protected) && (
                <small className="o2d-protected">
                  <LockKeyhole size={11} />
                  {field.hasFormula
                    ? 'Sheet formula / read only'
                    : 'Sheet protected'}
                </small>
              )}
              {field.inputType === 'select' ? (
                <O2DSelectField
                  id={`o2d-field-${field.key}`}
                  label={field.label}
                  value={value}
                  options={field.validationOptions ?? []}
                  disabled={disabled}
                  readOnly={readonly}
                  searchable={
                    (field.validationOptions?.length ?? 0) > 7 ||
                    /material status|remarks\s*\/\s*challenges|payment terms/i.test(
                      field.header,
                    )
                  }
                  onChange={(next) => onChange(field.column, next)}
                />
              ) : (
                <input
                  id={`o2d-field-${field.key}`}
                  aria-label={field.label}
                  type={date ? 'date' : 'text'}
                  value={value}
                  readOnly={readonly}
                  disabled={disabled}
                  onClick={(e) => {
                    if (date && !disabled) {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {
                        /* Native calendar remains available. */
                      }
                    }
                  }}
                  onChange={(e) => {
                    if (!readonly) onChange(field.column, e.target.value);
                  }}
                />
              )}
              {readonly && !field.hasFormula && !field.protected && (
                <small className="o2d-readonly">
                  <LockKeyhole size={11} /> Read only
                </small>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
