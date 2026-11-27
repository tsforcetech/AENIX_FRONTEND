/**
 * Document numbering (prototype). The backend owns real sequences (gap-free per series).
 * Numbers are PREFIX + zero-padded sequence, e.g. AEN078 (tax invoice), GRN061, CN078.
 */
export function seqOf(docNumber: string): number {
  const m = /(\d+)\s*$/.exec(docNumber);
  return m ? Number(m[1]) : 0;
}

export function nextDocNumber(existing: string[], prefix: string, minDigits = 3, floor = 0): string {
  const max = Math.max(floor, ...existing.filter((n) => n.startsWith(prefix)).map(seqOf));
  return `${prefix}${String(max + 1).padStart(minDigits, '0')}`;
}
