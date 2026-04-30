import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketItem } from '../types';

const MATURITY_ORDER = ['US3M', 'US6M', 'US1Y', 'US2Y', 'US3Y', 'US5Y', 'US7Y', 'US10Y', 'US20Y', 'US30Y'];
const MATURITY_LABEL: Record<string, string> = {
  US3M: '3M', US6M: '6M', US1Y: '1Y', US2Y: '2Y', US3Y: '3Y',
  US5Y: '5Y', US7Y: '7Y', US10Y: '10Y', US20Y: '20Y', US30Y: '30Y',
};
const MATURITY_YEARS: Record<string, number> = {
  US3M: 0.25, US6M: 0.5, US1Y: 1, US2Y: 2, US3Y: 3,
  US5Y: 5, US7Y: 7, US10Y: 10, US20Y: 20, US30Y: 30,
};

const COMPARISONS = [
  { key: 'd1',  label: '1D ago', days: 1,   color: '#b0b0b0' },
  { key: 'w1',  label: '1W ago', days: 7,   color: '#f5cc80' },
  { key: 'm1',  label: '1M ago', days: 30,  color: '#e8825d' },
  { key: 'y1',  label: '1Y ago', days: 365, color: '#ff5a6a' },
];
const CUSTOM_COLOR = '#b266ff';

interface CurvePoint { symbol: string; label: string; years: number; yield: number; actualDate: string }
interface CurvePayload { date: string; points: CurvePoint[] }

function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface Props {
  items: MarketItem[];
}

export default function YieldCurve({ items }: Props) {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [customDate, setCustomDate] = useState('');
  const [overlays, setOverlays] = useState<Record<string, CurvePayload>>({});
  const today = new Date().toISOString().slice(0, 10);

  const todayPoints = useMemo(() => MATURITY_ORDER
    .map(k => {
      const it = items.find(i => i.symbol === k);
      if (!it || it.error || it.price == null) return null;
      return { key: k, label: MATURITY_LABEL[k], years: MATURITY_YEARS[k], yield: it.price };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null), [items]);

  // Dates we need from the API (comparison toggles + optional custom date)
  const datesToFetch = useMemo(() => {
    const out: { key: string; date: string }[] = [];
    for (const c of COMPARISONS) if (active.has(c.key)) out.push({ key: c.key, date: isoDaysAgo(c.days) });
    if (customDate) out.push({ key: 'custom', date: customDate });
    return out;
  }, [active, customDate]);

  useEffect(() => {
    if (!datesToFetch.length) { setOverlays({}); return; }
    let live = true;
    const dates = datesToFetch.map(d => d.date).join(',');
    fetch(`/api/yield-curve?dates=${dates}`)
      .then(r => r.json())
      .then(data => {
        if (!live) return;
        const byDate: Record<string, CurvePayload> = {};
        for (const c of (data.curves || [])) byDate[c.date] = c;
        const out: Record<string, CurvePayload> = {};
        for (const d of datesToFetch) if (byDate[d.date]) out[d.key] = byDate[d.date];
        setOverlays(out);
      })
      .catch(() => 0);
    return () => { live = false; };
  }, [datesToFetch.map(d => `${d.key}|${d.date}`).join(',')]);

  // Build per-maturity rows: { label, years, today, d1, w1, m1, y1, custom }
  const chartData = useMemo(() => MATURITY_ORDER.map(k => {
    const t = todayPoints.find(p => p.key === k);
    const row: Record<string, number | string> = {
      key: k, label: MATURITY_LABEL[k], years: MATURITY_YEARS[k],
    };
    if (t) row.today = t.yield;
    for (const oKey of Object.keys(overlays)) {
      const pt = overlays[oKey].points.find(p => p.symbol === k);
      if (pt) row[oKey] = pt.yield;
    }
    return row;
  }), [todayPoints, overlays]);

  // Y-axis domain
  const allYields: number[] = [];
  for (const r of chartData) {
    for (const k of Object.keys(r)) {
      if (k === 'key' || k === 'label' || k === 'years') continue;
      const v = r[k];
      if (typeof v === 'number') allYields.push(v);
    }
  }
  if (allYields.length < 2) return null;
  const min = Math.min(...allYields);
  const max = Math.max(...allYields);
  const pad = (max - min) * 0.15 || 0.1;

  const toggleComp = (key: string) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="perf-bar">
      <div className="yc-head">
        <h2>US Treasury Yield Curve</h2>
        <div className="yc-controls">
          {COMPARISONS.map(c => (
            <button
              key={c.key}
              className={`filter-chip${active.has(c.key) ? ' active' : ''}`}
              onClick={() => toggleComp(c.key)}
              style={active.has(c.key) ? { background: c.color, borderColor: c.color, color: '#222' } : {}}
            >
              {c.label}
            </button>
          ))}
          <span className="yc-date-wrap">
            <input
              type="date"
              max={today}
              value={customDate}
              placeholder="YYYY-MM-DD"
              onChange={e => setCustomDate(e.target.value)}
              style={customDate ? { borderColor: CUSTOM_COLOR } : {}}
            />
            {customDate && (
              <button className="news-clear" onClick={() => setCustomDate('')} aria-label="Clear date">×</button>
            )}
          </span>
        </div>
      </div>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} tickLine={false} />
            <YAxis
              domain={[min - pad, max + pad]}
              stroke="var(--muted)"
              fontSize={11}
              tickFormatter={v => `${(v as number).toFixed(2)}%`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--fg)',
                fontSize: 12,
              }}
              formatter={(v: number, name) => [`${v.toFixed(3)}%`, name]}
              labelFormatter={l => `Maturity: ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Overlays first so today renders on top */}
            {Object.entries(overlays).map(([k]) => {
              if (k === 'custom') {
                return (
                  <Line key={k} type="monotone" dataKey={k} stroke={CUSTOM_COLOR}
                        strokeWidth={1.7} dot={false} name={customDate} />
                );
              }
              const c = COMPARISONS.find(x => x.key === k);
              if (!c) return null;
              return (
                <Line key={k} type="monotone" dataKey={k} stroke={c.color}
                      strokeDasharray="4 4" strokeWidth={1.5} dot={false} name={c.label} />
              );
            })}
            <Line
              type="monotone"
              dataKey="today"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--accent)' }}
              activeDot={{ r: 5 }}
              name="Today"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
