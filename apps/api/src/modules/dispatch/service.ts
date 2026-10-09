import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type {
  DispatchOrderDocument,
  DispatchOrderLine,
  DispatchPreview,
  DispatchSaved,
  O2DBranch,
  O2DRow,
  DispatchMaterials,
} from '@cre/shared';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import { withCreationLock } from '../enquiries/lock.js';
import {
  GoogleSheetsO2DRepository,
  type O2DRepository,
  type O2DSnapshot,
  isCellProtected,
} from '../o2d/repository.js';
import { normalizeO2DHeader as norm } from '../o2d/headers.js';
import { o2dAuditRequests } from '../o2d/audit.js';
import { cellWrite } from '../google/sheets.js';
import { renderPdf } from '../documents/pdf.js';
import { uploadPdf, checkPdfFolder } from '../documents/drive.js';
import { dispatchCompany, dispatchTerms, dispatchFooter } from './config.js';
import { DispatchMasters } from './masters.js';
import {
  dispatchInputSchema,
  type DispatchInput,
  type DispatchEmail,
} from './schema.js';
import { dispatchHtml } from './template.js';
import { dispatchEmailReady, sendDispatchEmail } from './email.js';
import { DispatchAudit } from './audit.js';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(', ');
function decimal(value: string | number, label: string) {
  if (
    !/^(?:\d{1,12})(?:\.\d{1,6})?$/.test(
      String(value).replaceAll(',', '').trim(),
    )
  )
    throw new BusinessError(
      400,
      'DISPATCH_NUMBER_INVALID',
      `${label} must be a valid non-negative number.`,
    );
  return new Decimal(String(value).replaceAll(',', ''));
}
export function dispatchTotals(
  lines: DispatchOrderLine[],
  other: string | number,
  loading: string | number,
  gst: string | number,
) {
  const totalQty = lines.reduce((sum, l) => sum.plus(l.qty), new Decimal(0));
  // Round money once per line, then sum the displayed amounts so every document reconciles.
  const calculated = lines.map((l) => ({
    ...l,
    totalPrice: new Decimal(l.qty)
      .times(l.unitPrice)
      .toFixed(2, Decimal.ROUND_HALF_UP),
  }));
  const goodsTotal = calculated.reduce(
    (s, l) => s.plus(l.totalPrice),
    new Decimal(0),
  );
  const otherCharges = decimal(other, 'Other Charges').toDecimalPlaces(2),
    pkgLoading = decimal(loading, 'Loading Charges').toDecimalPlaces(2),
    gstRate = decimal(gst, 'GST rate');
  if (gstRate.gt(100))
    throw new BusinessError(
      400,
      'GST_INVALID',
      'GST rate must be between 0 and 100.',
    );
  const taxableTotal = goodsTotal.plus(otherCharges).plus(pkgLoading);
  const gstAmount = taxableTotal
    .times(gstRate)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    lines: calculated,
    totalQty: totalQty.toFixed(),
    goodsTotal: goodsTotal.toFixed(2),
    otherCharges: otherCharges.toFixed(2),
    pkgLoading: pkgLoading.toFixed(2),
    gstRate: gstRate.toFixed(),
    taxableTotal: taxableTotal.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    grandTotal: taxableTotal.plus(gstAmount).toFixed(2),
  };
}
export function dispatchFilename(
  enquiryNo: string,
  time = new Date(),
  zone = 'Asia/Calcutta',
) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(time)
      .map((v) => [v.type, v.value]),
  );
  const safe = Array.from(enquiryNo, (c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .replace(/[\\/:*?"<>|\s]/g, '_')
    .slice(0, 100);
  return `Dispatch_Order_${safe}_${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}${p.second}.pdf`;
}
export class DispatchOrderService {
  constructor(
    private env: Env,
    private repository: O2DRepository = new GoogleSheetsO2DRepository(env),
    private masters: Pick<
      DispatchMasters,
      'party' | 'transporters'
    > = new DispatchMasters(env),
    private pdf = renderPdf,
    private upload = uploadPdf,
    private checkFolder = checkPdfFolder,
    private email = sendDispatchEmail,
    private audit = new DispatchAudit(),
    private now = () => new Date(),
  ) {}
  private async columns(snapshot: O2DSnapshot) {
    const layout = await this.repository.steps?.(
      snapshot,
      snapshot.rows[0]?.rowNumber,
    );
    const get = (step: number, header: string) => {
      const fields = layout?.steps
        .find((s) => s.stepNumber === step)
        ?.fields.filter((f) => norm(f.header) === norm(header));
      if (fields?.length !== 1)
        throw new BusinessError(
          409,
          'DISPATCH_MAPPING_REQUIRED',
          `Cannot uniquely map ${header} within Step ${step}.`,
        );
      return fields[0]!.column;
    };
    return {
      approval: get(8, 'Status PR'),
      link: get(9, 'Dispatch Order link'),
    };
  }
  private select(
    snapshot: O2DSnapshot,
    input: DispatchInput,
    approval: number,
  ) {
    if (new Set(input.srNos).size !== input.srNos.length)
      throw new BusinessError(
        409,
        'ROW_SELECTION_INVALID',
        'Select each material Sr no only once.',
      );
    const rows = input.srNos.map((sr) => {
      const matches = snapshot.rows.filter(
        (r) => r.enquiryNo === input.enquiryNo && r.srNo === sr,
      );
      if (matches.length !== 1)
        throw new BusinessError(
          409,
          'ROW_SELECTION_INVALID',
          'Enquiry No and every selected Sr No must match exactly once.',
        );
      const row = matches[0]!;
      if (input.versions && input.versions[sr] !== row.version)
        throw new BusinessError(
          409,
          'ROW_CHANGED',
          'A selected material changed. Reload the enquiry and review the document before saving.',
        );
      return row;
    });
    if (
      new Set(rows.map((r) => norm(r.customer))).size !== 1 ||
      !rows[0]?.customer.trim()
    )
      throw new BusinessError(
        400,
        'CUSTOMER_MISMATCH',
        'Selected material rows have different customer names. Please create one customer Dispatch Order at a time.',
      );
    if (
      rows.some(
        (r) =>
          norm(r.fields.find((f) => f.column === approval)?.value ?? '') !==
          'approved',
      )
    )
      throw new BusinessError(
        409,
        'DISPATCH_NOT_APPROVED',
        'Every selected material must have Approved in Step 8 Status PR before generating a Dispatch Order.',
      );
    return rows;
  }
  async enquiries(branch: O2DBranch) {
    const snapshot = await this.repository.load(branch);
    const c = await this.columns(snapshot);
    const rows = snapshot.rows.filter(
      (r) =>
        norm(r.fields.find((f) => f.column === c.approval)?.value ?? '') ===
        'approved',
    );
    return {
      enquiries: [...new Set(rows.map((r) => r.enquiryNo))],
      writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
    };
  }
  async materials(
    branch: O2DBranch,
    enquiryNo: string,
  ): Promise<DispatchMaterials> {
    const snapshot = await this.repository.load(branch);
    const c = await this.columns(snapshot);
    const rows = snapshot.rows.filter((r) => r.enquiryNo === enquiryNo);
    const transport = await this.masters.transporters(branch);
    let emailTo = '';
    if (rows.length && new Set(rows.map((r) => r.customer)).size === 1)
      emailTo = (await this.masters.party(branch, enquiryNo, rows[0]!.customer))
        .party.email;
    return {
      rows: rows.map((r) => ({
        srNo: r.srNo,
        sku: r.sku,
        customer: r.customer,
        approval: r.fields.find((f) => f.column === c.approval)?.value ?? '',
        approved:
          norm(r.fields.find((f) => f.column === c.approval)?.value ?? '') ===
          'approved',
        version: r.version,
      })),
      transporters: transport.rows,
      warnings: transport.warnings,
      company: dispatchCompany(this.env, branch),
      emailReady: dispatchEmailReady(this.env),
      writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
      emailTo,
    };
  }
  async buildDocument(branch: O2DBranch, raw: DispatchInput) {
    const input = dispatchInputSchema.parse(raw),
      snapshot = await this.repository.load(branch),
      columns = await this.columns(snapshot),
      rows = this.select(snapshot, input, columns.approval);
    const customer = rows[0]!.customer;
    const [{ party, warnings }, transport] = await Promise.all([
      this.masters.party(branch, input.enquiryNo, customer),
      this.masters.transporters(branch),
    ]);
    const get = (row: O2DRow, header: string) =>
      row.fields.find((f) => norm(f.header) === norm(header))?.value ?? '';
    const lines: DispatchOrderLine[] = rows.map((r) => {
      const qty = decimal(get(r, 'Order Qty'), 'Order Qty'),
        rate = decimal(get(r, 'Order Rate'), 'Order Rate');
      if (qty.lte(0))
        throw new BusinessError(
          400,
          'QTY_REQUIRED',
          'Order Qty must be greater than zero.',
        );
      return {
        srNo: r.srNo,
        sku: r.sku,
        lotNo: r.lotNo,
        grade: r.grade,
        mt: r.category,
        finish: r.finish,
        thk: r.thickness,
        wid: r.width,
        lgt: r.length,
        nos: get(r, 'Nos'),
        qty: qty.toFixed(),
        unitPrice: rate.toFixed(),
        totalPrice: '',
      };
    });
    const loadingColumns = snapshot.headerMap.columns.filter((c) =>
      ['loading', 'loading charges', 'pkg. & loading charges'].includes(
        norm(c.header),
      ),
    );
    if (loadingColumns.length > 1)
      throw new BusinessError(
        409,
        'LOADING_AMBIGUOUS',
        'Multiple loading-charge fields exist. Verify their mapping.',
      );
    let loading = new Decimal(0);
    if (loadingColumns[0])
      for (const r of rows) {
        const value =
          r.fields.find((f) => f.column === loadingColumns[0]!.column)?.value ||
          '0';
        loading = loading.plus(decimal(value, 'Loading Charges'));
      }
    const o = input.overrides;
    const transportName =
      o.transporterName ?? unique(rows.map((r) => r.transporter));
    const transporter = transport.rows.find((t) => t.name === transportName);
    if (transportName && !transporter)
      throw new BusinessError(
        409,
        'TRANSPORTER_INVALID',
        'Select a transporter from the configured master. The saved transporter is not currently available.',
      );
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: snapshot.timeZone || 'Asia/Calcutta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now());
    const document: DispatchOrderDocument = {
      ...dispatchCompany(this.env, branch),
      branch,
      enquiryNo: input.enquiryNo,
      selectedSrNos: input.srNos,
      customer,
      date,
      termsOfPayment: unique(rows.map((r) => r.paymentTerms)),
      poRefNo: unique(rows.map((r) => r.poNumber)),
      termsOfDelivery: 'Destination',
      deliveryLocation: '',
      ...party,
      vehicleNumber: unique(rows.map((r) => r.vehicleNumber)),
      transporterName: transportName,
      transporterGST: transporter?.gstin ?? '',
      termsText: dispatchTerms,
      footerText: dispatchFooter,
      ...o,
      ...dispatchTotals(
        lines,
        o.otherCharges ?? 0,
        o.pkgLoading ?? loading.toFixed(),
        o.gstRate ?? this.env.DISPATCH_GST_RATE,
      ),
      sourceVersions: Object.fromEntries(rows.map((r) => [r.srNo, r.version])),
      warnings: [
        ...warnings,
        ...transport.warnings,
        ...(loadingColumns.length
          ? []
          : [
              'No loading-charge column exists in current O2D. Enter applicable loading charges in this document.',
            ]),
      ],
    };
    const fingerprint = hash(document);
    if (input.fingerprint && input.fingerprint !== fingerprint)
      throw new BusinessError(
        409,
        'DISPATCH_PREVIEW_CHANGED',
        'Document data changed since the preview. Preview again before issuing.',
      );
    return { document, fingerprint, snapshot, rows, columns };
  }
  async preview(
    branch: O2DBranch,
    input: DispatchInput,
  ): Promise<DispatchPreview> {
    const built = await this.buildDocument(branch, input);
    await this.audit.event('DISPATCH_PREVIEW', {
      branch,
      enquiryNo: input.enquiryNo,
      selectedSrNos: input.srNos,
      customer: built.document.customer,
    });
    return {
      document: built.document,
      fingerprint: built.fingerprint,
      html: dispatchHtml(built.document),
      filename: dispatchFilename(
        input.enquiryNo,
        this.now(),
        built.snapshot.timeZone,
      ),
    };
  }
  private issuance(document: DispatchOrderDocument) {
    if (!document.billToAddress.trim() || !document.shipToAddress.trim())
      throw new BusinessError(
        409,
        'PARTY_ADDRESS_REQUIRED',
        'Complete Bill To and Ship To addresses before downloading, saving or emailing.',
      );
  }
  async download(branch: O2DBranch, input: DispatchInput) {
    const built = await this.buildDocument(branch, input);
    this.issuance(built.document);
    const pdf = await this.pdf(this.env, dispatchHtml(built.document));
    const filename = dispatchFilename(
      input.enquiryNo,
      this.now(),
      built.snapshot.timeZone,
    );
    await this.audit.event('DISPATCH_PDF_DOWNLOAD', {
      branch,
      enquiryNo: input.enquiryNo,
      selectedSrNos: input.srNos,
      customer: built.document.customer,
    });
    return { pdf, filename };
  }
  async save(
    branch: O2DBranch,
    input: DispatchInput,
    email?: DispatchEmail,
  ): Promise<DispatchSaved> {
    if (this.env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Enable Sheet writes before saving dispatch orders.',
      );
    const parsed = dispatchInputSchema.parse(input);
    if (!parsed.requestId)
      throw new BusinessError(
        400,
        'REQUEST_ID_REQUIRED',
        'A request identifier is required. Reload the builder.',
      );
    if (email && !dispatchEmailReady(this.env))
      throw new BusinessError(
        409,
        'EMAIL_CONFIGURATION_REQUIRED',
        'Configure the authorized dispatch sender and SMTP settings before sending email.',
      );
    return withCreationLock(async () => {
      const id = parsed.requestId!,
        operationHash = hash({ branch, input: parsed, email });
      const prior = await this.audit.read(id);
      if (prior) {
        if (prior.hash !== operationHash)
          throw new BusinessError(
            409,
            'REQUEST_CHANGED',
            'This submission changed. Preview again before saving.',
          );
        if (prior.phase === 'complete' && prior.result) return prior.result;
        throw new BusinessError(
          409,
          'DISPATCH_UNCONFIRMED',
          `A previous attempt needs review before retrying.${prior.result?.url ? ' PDF: ' + prior.result.url : ''} ${prior.error ?? ''}`,
        );
      }
      const built = await this.buildDocument(branch, parsed);
      this.issuance(built.document);
      const writable = (snap: O2DSnapshot, rows: O2DRow[], column: number) => {
        if (
          rows.some((r) => isCellProtected(snap, r.rowNumber - 1, column - 1))
        )
          throw new BusinessError(
            409,
            'DISPATCH_LINK_PROTECTED',
            'A selected Dispatch Order link cell is formula-controlled or protected. No link was written.',
          );
      };
      writable(built.snapshot, built.rows, built.columns.link);
      await this.checkFolder(this.env, this.env.DISPATCH_PDF_FOLDER_ID);
      const pdf = await this.pdf(this.env, dispatchHtml(built.document));
      const recheck = async () => {
        const snap = await this.repository.load(branch);
        const columns = await this.columns(snap);
        const rows = this.select(
          snap,
          { ...parsed, versions: built.document.sourceVersions },
          columns.approval,
        );
        if (
          columns.link !== built.columns.link ||
          snap.source.id !== built.snapshot.source.id ||
          snap.source.sheetId !== built.snapshot.source.sheetId
        )
          throw new BusinessError(
            409,
            'ROW_CHANGED',
            'The dispatch source layout changed. Reload the enquiry.',
          );
        writable(snap, rows, columns.link);
        return { snap, columns, rows };
      };
      await recheck();
      const filename = dispatchFilename(
        parsed.enquiryNo,
        this.now(),
        built.snapshot.timeZone,
      );
      await this.audit.write(id, {
        hash: operationHash,
        phase: 'upload-started',
      });
      let result: DispatchSaved | undefined;
      let phase = 'upload-started';
      try {
        const file = await this.upload(
          this.env,
          this.env.DISPATCH_PDF_FOLDER_ID,
          filename,
          pdf,
        );
        result = { ...file, filename, updatedRows: 0 };
        phase = 'uploaded';
        await this.audit.write(id, { hash: operationHash, phase, result });
        const current = await recheck();
        phase = 'link-write-started';
        await this.audit.write(id, { hash: operationHash, phase, result });
        await this.repository.commit(current.snap, [
          ...current.rows.map((r) =>
            cellWrite(
              current.snap.source.sheetId,
              r.rowNumber - 1,
              current.columns.link - 1,
              file.url,
            ),
          ),
          ...o2dAuditRequests(
            current.snap,
            current.rows.map((r) => ({
              action: 'DISPATCH_ORDER_SAVE',
              enquiryNo: r.enquiryNo,
              srNo: r.srNo,
              field: 'Dispatch Order link',
              oldValue: r.dispatchLink ?? '',
              newValue: file.url,
            })),
          ),
        ]);
        result.updatedRows = current.rows.length;
        phase = 'linked';
        await this.audit.write(id, { hash: operationHash, phase, result });
        const details = {
          branch,
          enquiryNo: parsed.enquiryNo,
          selectedSrNos: parsed.srNos,
          customer: built.document.customer,
          fileId: file.id,
          fileUrl: file.url,
        };
        await this.audit.event('DISPATCH_ORDER_SAVE', details);
        if (email) {
          phase = 'email-started';
          await this.audit.write(id, { hash: operationHash, phase, result });
          const sent = await this.email(
            this.env,
            {
              ...email,
              subject: email.subject || `Dispatch Order - ${parsed.enquiryNo}`,
              message:
                email.message || 'Please find attached Dispatch Order PDF.',
            },
            pdf,
            filename,
          );
          result = { ...result, emailSent: true, messageId: sent.messageId };
          await this.audit.event('DISPATCH_ORDER_EMAIL', {
            ...details,
            messageId: sent.messageId,
          });
        }
        await this.audit.write(id, {
          hash: operationHash,
          phase: 'complete',
          result,
        });
        return result;
      } catch (e) {
        const error =
          e instanceof BusinessError
            ? e.message
            : 'The operation was not confirmed.';
        await this.audit.write(id, {
          hash: operationHash,
          phase,
          result,
          error,
        });
        throw new BusinessError(
          503,
          'DISPATCH_SAVE_UNCONFIRMED',
          `${error}${result?.url ? ' PDF saved at ' + result.url + '.' : ''} ${result?.updatedRows ? 'Selected links were saved.' : 'Sheet link writeback was not confirmed.'} Check the record before retrying.`,
        );
      }
    });
  }
}
