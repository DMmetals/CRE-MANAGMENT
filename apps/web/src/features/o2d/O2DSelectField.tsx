import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function O2DSelectField({
  id,
  label,
  value,
  options,
  onChange,
  searchable = false,
  disabled = false,
  readOnly = false,
  loading = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const unavailable = disabled || readOnly || loading;
  const expanded = open && !unavailable;
  const choices = [
    { value: '', label: 'Select...', disabled: false },
    ...(value && !options.includes(value)
      ? [{ value, label: `${value} (current value)`, disabled: true }]
      : []),
    ...[...new Set(options)]
      .filter(Boolean)
      .map((v) => ({ value: v, label: v, disabled: false })),
  ];
  const filtered = choices.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const tone = ['approved', 'verified'].includes(value.toLowerCase())
    ? 'success'
    : value.toLowerCase() === 'hold'
      ? 'warning'
      : ['cancelled', 'cancel'].includes(value.toLowerCase())
        ? 'danger'
        : '';
  const description = error ? `${id}-error` : undefined;
  function show() {
    setOpen(true);
    setQuery('');
    setActive(0);
  }
  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }
  useEffect(() => {
    if (expanded)
      list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, expanded]);
  return (
    <div
      className={`o2d-select ${tone ? `o2d-select-${tone}` : ''}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      {readOnly ? (
        <input
          id={id}
          aria-label={label}
          value={value}
          readOnly
          disabled={disabled}
        />
      ) : !searchable ? (
        <select
          id={id}
          aria-label={label}
          value={value}
          disabled={unavailable}
          aria-busy={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={description}
          onChange={(e) => onChange(e.target.value)}
        >
          {choices.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={id}
            role="combobox"
            aria-label={label}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={`${id}-options`}
            aria-activedescendant={
              expanded && filtered[active]
                ? `${id}-option-${active}`
                : undefined
            }
            aria-busy={loading}
            aria-invalid={Boolean(error)}
            aria-describedby={description}
            disabled={unavailable}
            placeholder={loading ? 'Loading options...' : 'Search or select...'}
            value={expanded ? query : value}
            onFocus={() => {
              if (!unavailable) show();
            }}
            onClick={() => {
              if (!unavailable && !expanded) show();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && expanded) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery('');
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!expanded) show();
                else
                  setActive((n) =>
                    Math.max(
                      0,
                      Math.min(
                        filtered.length - 1,
                        n + (e.key === 'ArrowDown' ? 1 : -1),
                      ),
                    ),
                  );
              } else if (e.key === 'Enter' && expanded) {
                e.preventDefault();
                const option = filtered[active];
                if (option && !option.disabled) choose(option.value);
              } else if (e.key === 'Tab') {
                setOpen(false);
                setQuery('');
              }
            }}
          />
          <ChevronDown
            size={15}
            className="o2d-select-arrow"
            aria-hidden="true"
          />
          {expanded && (
            <div
              ref={list}
              id={`${id}-options`}
              role="listbox"
              aria-label={`${label} options`}
              className="o2d-select-options"
            >
              {filtered.map((o, i) => (
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`${id}-option-${i}`}
                  key={o.value}
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  className={i === active ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (!o.disabled) choose(o.value);
                  }}
                >
                  {o.label}
                </button>
              ))}
              {!filtered.length && <p role="status">No matching options</p>}
            </div>
          )}
        </>
      )}
      {error && (
        <small id={`${id}-error`} role="alert" className="o2d-select-error">
          {error}
        </small>
      )}
    </div>
  );
}
