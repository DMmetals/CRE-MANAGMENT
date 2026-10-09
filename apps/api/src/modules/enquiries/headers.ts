export function normalizeHeader(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
export function mapHeaders(headers: string[]) {
  const map = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key) map.set(key, [...(map.get(key) ?? []), index]);
  });
  return (name: string, required = false) => {
    const indices = map.get(normalizeHeader(name)) ?? [];
    if (indices.length > 1) throw new Error(`Ambiguous header: ${name}`);
    if (required && !indices.length)
      throw new Error(`Required header missing: ${name}`);
    return indices[0];
  };
}
export function columnName(index: number) {
  let result = '';
  for (index++; index > 0; index = Math.floor((index - 1) / 26))
    result = String.fromCharCode(65 + ((index - 1) % 26)) + result;
  return result;
}
export function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const result = Number(value.replace(/,/g, ''));
  return Number.isFinite(result) ? result : null;
}
