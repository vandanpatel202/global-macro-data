import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryPayload, HistoryRange, MarketItem } from '../types';
import { dirClass, fmtChg, fmtNum, fmtPct } from '../format';
import { fetchHistory } from '../api';

interface Props {
  item: MarketItem;
  onClose: () => void;
}

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
];

export default function ChartModal({ item, onClose }: Props) {
  const [range, setRange] = useState<HistoryRange>('1y');
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchHistory(item.symbol, range)
      .then(p => { if (live) setHistory(p); })
      .catch(e => { if (live) setErr(String(e.message ?? e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [item.symbol, range]);

  const chartData = useMemo(() => {
    if (!history?.points?.length) return [];
    return history.points.map(p => ({ date: p.date, price: Number(p.close) }));
  }, [history]);

  // Range-window change/pct (first vs last close in the loaded window).
  const rangeStats = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    return { first, last, change: last - first, pct: first ? ((last - first) / first) * 100 : null };
  }, [chartData]);

  const up = (rangeStats?.change ?? item.change ?? 0) >= 0;
  const rootStyle = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const stroke = up
    ? rootStyle?.getPropertyValue('--up').trim() || '#2fd47a'
    : rootStyle?.getPropertyValue('--down').trim() || '#ff5a6a';

  const min = chartData.length ? Math.min(...chartData.map(d => d.price)) : 0;
  const max = chartData.length ? Math.max(...chartData.map(d => d.price)) : 0;
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.001;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="name">{item.name}</span>
            <span className="sym">
              {item.symbol}
              {item.region ? ` · ${item.region}` : ''}
              {item.currency ? ` · ${item.currency}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className="modal-stats">
              <span className="price">{fmtNum(item.price)}</span>
              <span className={`change ${dirClass(item.change)}`}>
                {fmtChg(item.change)} ({fmtPct(item.pct)})
              </span>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="range-tabs">
            {RANGES.map(r => (
              <button
                key={r.key}
                className={range === r.key ? 'active' : ''}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
            {rangeStats && (
              <span className={`range-stats ${dirClass(rangeStats.change)}`}>
                {fmtChg(rangeStats.change)} ({fmtPct(rangeStats.pct)}) over {RANGES.find(r => r.key === range)?.label}
              </span>
            )}
          </div>

          {loading && !chartData.length && <div className="empty-state">Loading history…</div>}
          {err && <div className="empty-state">Failed to load history: {err}</div>}
          {!loading && !err && !chartData.length && (
            <div className="empty-state">
              No historical data stored for {item.symbol} yet. Run <code>npm run db:backfill -- --symbol '{item.symbol}'</code>.
            </div>
          )}

          {chartData.length >= 2 && (
            <div style={{ width: '100%', height: 360, opacity: loading ? 0.6 : 1 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--muted)"
                    fontSize={11}
                    minTickGap={40}
                    tickFormatter={d => formatTick(d, range)}
                  />
                  <YAxis
                    domain={[min - pad, max + pad]}
                    stroke="var(--muted)"
                    fontSize={11}
                    tickFormatter={v => fmtNum(v)}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--fg)',
                      fontSize: 12,
                    }}
                    labelFormatter={(d: string) => d}
                    formatter={(v: number) => [fmtNum(v), 'Close']}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={stroke}
                    strokeWidth={2}
                    fill="url(#grad)"
                    animationDuration={300}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="modal-meta">
            <span>Previous close: <strong>{fmtNum(item.prevClose)}</strong></span>
            {item.marketState && <span>Market: <strong>{item.marketState}</strong></span>}
            {item.source && <span>Source: <strong>{item.source}</strong></span>}
            {item.ts && <span>Data ts: <strong>{new Date(item.ts).toLocaleString()}</strong></span>}
            {history && <span>Points: <strong>{history.points.length}</strong></span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTick(d: string, range: HistoryRange): string {
  // For short windows show day-of-month; for longer, show "MMM 'YY".
  if (!d) return '';
  const date = new Date(d);
  if (range === '1w' || range === '1m') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
