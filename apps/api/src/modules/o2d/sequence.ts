import { BusinessError } from '../enquiries/creation.js';

/** Allocates material serials within one enquiry while the caller holds the write lock. */
export class O2DSequenceService {
  nextSerials(
    enquiryNo: string,
    rows: { enquiryNo: string; srNo: string }[],
    count: number,
  ): number[] {
    const existing = rows.filter(
      (row) => row.enquiryNo.trim() === enquiryNo.trim(),
    );
    const serials = existing.map((row) => Number(row.srNo.trim()));
    if (
      serials.some((serial) => !Number.isSafeInteger(serial) || serial <= 0) ||
      new Set(serials).size !== serials.length
    )
      throw new BusinessError(
        409,
        'O2D_SERIAL_CONFLICT',
        'Existing O2D materials for this enquiry have missing, invalid or repeated Sr no values. Correct them before transferring another material.',
      );
    const last = serials.reduce((max, serial) => Math.max(max, serial), 0);
    if (!Number.isSafeInteger(last + count))
      throw new BusinessError(
        409,
        'O2D_SERIAL_LIMIT',
        'The material serial sequence exceeds the supported range.',
      );
    return Array.from({ length: count }, (_, index) => last + index + 1);
  }
}
