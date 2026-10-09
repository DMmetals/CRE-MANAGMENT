/** Canonical routing for Sheet branch values, shared by the API and UI. */
export function normalizeBranch(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (
    [
      'FBD',
      'FARIDABAD',
      'FARIDABAD BRANCH',
      'TRADE FBD',
      'TRADE(FBD)',
    ].includes(normalized)
  )
    return 'FBD';
  if (
    ['MUM', 'MUMBAI', 'MUMBAI BRANCH', 'TRADE MUM', 'TRADE(MUM)'].includes(
      normalized,
    )
  )
    return 'MUM';
  return normalized;
}
