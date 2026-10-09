export interface O2DDuplicateCandidate {
  enquiryNo: string;
  sku: string;
  edge: string;
  qty: number | null;
  poNumber: string;
}

/** Field boundaries are preserved, so embedded separators cannot collide. */
export function duplicateKey(row: O2DDuplicateCandidate): string {
  return JSON.stringify([
    row.enquiryNo.trim(),
    row.sku.trim(),
    row.edge.trim(),
    row.qty,
    row.poNumber.trim(),
  ]);
}

export class O2DDuplicateService {
  selectNew<T extends O2DDuplicateCandidate>(
    existing: O2DDuplicateCandidate[],
    candidates: T[],
  ) {
    const keys = new Set(existing.map(duplicateKey));
    const fresh: T[] = [];
    let skippedDuplicates = 0;
    const duplicates: T[] = [];
    for (const candidate of candidates) {
      const key = duplicateKey(candidate);
      if (keys.has(key)) {
        skippedDuplicates += 1;
        duplicates.push(candidate);
        continue;
      }
      keys.add(key);
      fresh.push(candidate);
    }
    return { fresh, skippedDuplicates, duplicates };
  }
}
