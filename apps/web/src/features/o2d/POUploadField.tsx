import { useRef } from 'react';
import { LockKeyhole, Upload, ExternalLink } from 'lucide-react';
import type { O2DField } from '@cre/shared';
export function POUploadField({
  field,
  revised,
  disabled,
  uploading,
  onUpload,
}: {
  field: O2DField;
  revised: boolean;
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = revised ? 'Revised PO Copy' : 'PO Copy';
  let url: string | undefined;
  try {
    const value = new URL(field.value);
    if (value.protocol === 'https:' || value.protocol === 'http:')
      url = value.href;
  } catch {
    /* Blank or an invalid legacy link. */
  }
  const button = uploading
    ? 'Uploading...'
    : field.value
      ? revised
        ? 'Replace Revised PO'
        : 'Replace PO'
      : revised
        ? 'Upload Revised PO'
        : 'Upload PO Copy';
  return (
    <div className="o2d-po-field">
      <span>{label}</span>
      {field.protected && (
        <small className="o2d-protected">
          <LockKeyhole size={11} /> Sheet formula / protected
        </small>
      )}
      <div className="o2d-po-actions">
        {url && (
          <a
            className="button secondary"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={13} />
            {revised ? 'View Revised PO' : 'View PO'}
          </a>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={disabled || field.protected}
          onClick={() => input.current?.click()}
        >
          <Upload size={13} />
          {button}
        </button>
        <input
          ref={input}
          hidden
          type="file"
          aria-label={`Choose ${label}`}
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          disabled={disabled || field.protected}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>
      <small className="o2d-readonly">PDF, JPG or PNG - up to 10 MB</small>
      {!!field.value && !url && (
        <small className="field-error">
          The saved PO link is invalid. Replace the file to update it.
        </small>
      )}
    </div>
  );
}
