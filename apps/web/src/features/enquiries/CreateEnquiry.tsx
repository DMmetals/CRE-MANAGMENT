import { normalizeBranch } from '@cre/shared';
import { useQuery } from '@tanstack/react-query';
import { request } from './api';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createEnquirySchema,
  type CreateEnquiryInput,
  type EnquiryType,
} from '@cre/shared';
import { Plus, Trash2, X, Save } from 'lucide-react';
import { saveEnquiry } from './api';
export function CreateEnquiry({
  type,
  date,
  onClose,
  onSaved,
}: {
  type: EnquiryType;
  date: string;
  onClose: () => void;
  onSaved: (number: string) => void;
}) {
  const preview = useQuery({
    queryKey: ['next-number', type],
    queryFn: () =>
      request<{ enquiryNo: string; date: string }>(
        `/api/enquiries/${type}/next-number`,
      ),
  });
  const [error, setError] = useState('');
  const form = useForm<CreateEnquiryInput>({
    resolver: zodResolver(createEnquirySchema),
    defaultValues: {
      type,
      requestId: crypto.randomUUID(),
      customerName: '',
      salesPerson: '',
      branch: 'FBD',
      materials: [
        {
          materialType: '',
          sku: '',
          edge: 'ME',
          qty: 0,
          limit: '',
          mode: 'Whatsapp',
        },
      ],
    },
  });
  const materials = useFieldArray({ control: form.control, name: 'materials' });
  const customerName = form.watch('customerName');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const customerOptions = useQuery({
    queryKey: ['customers', type],
    queryFn: () => request<string[]>(`/api/customers/${type}`),
    staleTime: 60000,
  });
  const salesOptions = useQuery({
    queryKey: ['sales-persons', type],
    queryFn: () =>
      request<{ options: string[]; source: string }>(
        `/api/meta/sales-persons/${type}`,
      ),
  });
  const writeConfig = useQuery({
    queryKey: ['enquiry-config'],
    queryFn: () => request<{ writesEnabled: boolean }>('/api/enquiries-config'),
  });
  const customerInfo = useQuery({
    queryKey: ['customer', type, customerName],
    enabled: !!customerName,
    queryFn: () =>
      request<{
        customer: string;
        state: string;
        purchaser: string;
        phone: string;
        email: string;
        branch: string;
        salesPerson: string;
      }>(`/api/customers/${type}/${encodeURIComponent(customerName)}`),
  });
  const customer = customerInfo.data;
  async function chooseCustomer(name: string) {
    form.setValue('customerName', name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!name) return;
    try {
      const info = await request<{ salesPerson: string; branch: string }>(
        `/api/customers/${type}/${encodeURIComponent(name)}`,
      );
      if (salesOptions.data?.options.includes(info.salesPerson))
        form.setValue('salesPerson', info.salesPerson);
      const customerBranch = normalizeBranch(info.branch);
      if (customerBranch === 'FBD' || customerBranch === 'MUM')
        form.setValue('branch', customerBranch);
    } catch {
      setError('Unable to load customer details. Retry your selection.');
    }
  }
  const errors = form.formState.errors;
  const busy = form.formState.isSubmitting;
  function close() {
    if (busy) return;
    if (
      form.formState.isDirty &&
      !window.confirm('Discard this unsaved enquiry?')
    )
      return;
    onClose();
  }
  return (
    <div className="crm-modal-backdrop">
      <section
        className="crm-form-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-enquiry-title"
      >
        <header>
          <div>
            <div className="eyebrow">{type} / NEW ENQUIRY</div>
            <h2 id="new-enquiry-title">Add customer enquiry</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close enquiry form"
            disabled={busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            setError('');
            try {
              const result = await saveEnquiry(values);
              onSaved(result.enquiryNo);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to save.');
            }
          })}
        >
          <div className="crm-form-body">
            {writeConfig.data?.writesEnabled === false && (
              <p className="connection-banner" role="status">
                Read-only mode. To save, set ENABLE_SHEET_WRITES=true in the
                project .env and restart the backend.
              </p>
            )}
            <div className="crm-number-preview">
              <span>
                Enquiry number
                <strong>
                  {preview.data?.enquiryNo ?? 'Loading number...'}
                </strong>
              </span>
              <span>
                Business date<strong>{date}</strong>
              </span>
            </div>
            <h3>Customer information</h3>
            <div className="crm-fields">
              <div className="span-two">
                <div
                  className="crm-customer-select"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setCustomerSearchOpen(false);
                      setCustomerSearch('');
                    }
                  }}
                >
                  <label htmlFor="customer-name">Customer name</label>
                  <input
                    id="customer-name"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={customerSearchOpen}
                    aria-controls="customer-options"
                    autoComplete="off"
                    placeholder={
                      customerOptions.isPending
                        ? 'Loading customers...'
                        : 'Select customer'
                    }
                    value={customerSearchOpen ? customerSearch : customerName}
                    onFocus={() => {
                      setCustomerSearch('');
                      setCustomerSearchOpen(true);
                    }}
                    onChange={(event) => {
                      setCustomerSearch(event.target.value);
                      setCustomerSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setCustomerSearchOpen(false);
                        setCustomerSearch('');
                      }
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setCustomerSearchOpen(true);
                        document
                          .querySelector<HTMLButtonElement>(
                            '#customer-options button',
                          )
                          ?.focus();
                      }
                      if (event.key === 'Enter') event.preventDefault();
                    }}
                  />
                  {customerSearchOpen && (
                    <div
                      id="customer-options"
                      role="listbox"
                      aria-label="Customers"
                      className="crm-customer-options"
                    >
                      {(customerOptions.data ?? [])
                        .filter((name) =>
                          name
                            .toLowerCase()
                            .includes(customerSearch.toLowerCase()),
                        )
                        .slice(0, 100)
                        .map((name) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={name === customerName}
                            key={name}
                            onClick={() => {
                              void chooseCustomer(name);
                              setCustomerSearchOpen(false);
                              setCustomerSearch('');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                (
                                  event.currentTarget
                                    .nextElementSibling as HTMLElement | null
                                )?.focus();
                              }
                              if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                (
                                  event.currentTarget
                                    .previousElementSibling as HTMLElement | null
                                )?.focus();
                              }
                              if (event.key === 'Escape') {
                                setCustomerSearchOpen(false);
                                setCustomerSearch('');
                              }
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      {customerOptions.isPending && (
                        <div className="crm-customer-empty">
                          Loading customers...
                        </div>
                      )}
                      {customerOptions.isSuccess &&
                        !customerOptions.data.some((name) =>
                          name
                            .toLowerCase()
                            .includes(customerSearch.toLowerCase()),
                        ) && (
                          <div className="crm-customer-empty">
                            No matching customers
                          </div>
                        )}
                    </div>
                  )}
                </div>
                <small className="field-error">
                  {errors.customerName?.message}
                </small>
                {customerOptions.isPending && (
                  <small>Loading party master...</small>
                )}
                {customerOptions.isError && (
                  <small role="alert">
                    Unable to load customers.{' '}
                    <button
                      type="button"
                      onClick={() => void customerOptions.refetch()}
                    >
                      Retry
                    </button>
                  </small>
                )}
              </div>
              <label>
                Sales person
                <select
                  aria-label="Sales person"
                  {...form.register('salesPerson')}
                >
                  <option value="">Select sales person</option>
                  {salesOptions.data?.options.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <small className="field-error">
                  {errors.salesPerson?.message}
                </small>
                {salesOptions.isError && (
                  <small role="alert">
                    Unable to load sales people.{' '}
                    <button
                      type="button"
                      onClick={() => void salesOptions.refetch()}
                    >
                      Retry
                    </button>
                  </small>
                )}
              </label>
              <label>
                Branch
                <select {...form.register('branch')}>
                  <option>FBD</option>
                  <option>MUM</option>
                </select>
              </label>
            </div>
            {customer && (
              <div className="crm-customer-info">
                <strong>{customer.purchaser || customer.customer}</strong>
                <span>
                  {[customer.state, customer.phone, customer.email]
                    .filter(Boolean)
                    .join(' / ') || 'No contact details on this record.'}
                </span>
                <small>
                  Customer details from New Party addition. Auto columns remain
                  managed by the Sheet.
                </small>
              </div>
            )}
            <div className="crm-material-heading">
              <h3>
                Materials <span>{materials.fields.length}</span>
              </h3>
              <button
                type="button"
                className="button secondary"
                disabled={materials.fields.length >= 50 || busy}
                onClick={() =>
                  materials.append({
                    materialType: '',
                    sku: '',
                    edge: 'ME',
                    qty: 0,
                    limit: '',
                    mode: 'Whatsapp',
                  })
                }
              >
                <Plus size={14} />
                Add material
              </button>
            </div>
            {materials.fields.map((field, index) => (
              <section className="crm-material-card" key={field.id}>
                <div className="crm-material-heading">
                  <strong>Material {index + 1}</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove material ${index + 1}`}
                    disabled={materials.fields.length === 1 || busy}
                    onClick={() => materials.remove(index)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="crm-fields">
                  <label>
                    Material type
                    <input
                      {...form.register(`materials.${index}.materialType`)}
                      placeholder="e.g. Sheet"
                    />
                  </label>
                  <label>
                    SKU
                    <input
                      {...form.register(`materials.${index}.sku`)}
                      placeholder="0.80-1250-2500-2B-304"
                    />
                    <small className="field-error">
                      {errors.materials?.[index]?.sku?.message}
                    </small>
                  </label>
                  <label>
                    Edge
                    <select {...form.register(`materials.${index}.edge`)}>
                      <option>ME</option>
                      <option>TE</option>
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      step="any"
                      {...form.register(`materials.${index}.qty`, {
                        valueAsNumber: true,
                      })}
                    />
                    <small className="field-error">
                      {errors.materials?.[index]?.qty?.message}
                    </small>
                  </label>
                  <label>
                    Limit
                    <input {...form.register(`materials.${index}.limit`)} />
                  </label>
                  <label>
                    Enquiry mode
                    <select
                      aria-label={`Enquiry mode ${index + 1}`}
                      {...form.register(`materials.${index}.mode`)}
                    >
                      <option>Whatsapp</option>
                      <option>Mail</option>
                    </select>
                  </label>
                </div>
              </section>
            ))}
            {error && (
              <div role="alert" className="crm-error">
                {error}
              </div>
            )}
          </div>
          <footer className="crm-form-footer">
            <span>All materials share one enquiry number.</span>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              <Save size={15} />
              {busy ? 'Saving enquiry...' : 'Create Enquiry'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
