// Small formatting helpers tuned for the G2's 576x288 monochrome display:
// short strings, no tiny decimals, sign always visible on percentages.

export function fmtUsd(v: number): string {
  if (!isFinite(v)) return '$--';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return '$' + v.toFixed(1);
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
}

export function fmtUsdExact(v: number): string {
  return (
    '$' +
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtPct(v: number): string {
  if (!isFinite(v)) return '--%';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

export function fmtQty(v: number): string {
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(6);
}

export function fmtClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
