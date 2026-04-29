export const fmtNum = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 100) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export const fmtPct = (v: number | null | undefined): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export const fmtChg = (v: number | null | undefined): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${fmtNum(v)}`;

export const dirClass = (n: number | null | undefined): 'up' | 'down' | 'flat' => {
  if (n == null) return 'flat';
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
};

export const timeAgo = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
