/** Calendar dates are deliberately converted without the host timezone. */
export function dateSerial(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    return null;
  return (time - Date.UTC(1899, 11, 30)) / 86400000;
}
export function dateInputValue(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (dateSerial(text) !== null) return text;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
    return dateSerial(iso) === null ? '' : iso;
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 0 && serial <= 2958465)
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
        .toISOString()
        .slice(0, 10);
  }
  return '';
}
