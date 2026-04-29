import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Nav from '../components/Nav';
import type { MacroIndexPayload, MacroSeriesPayload } from '../types';
import { fetchMacroIndex, fetchMacroSeries } from '../api';
import { fmtNum } from '../format';

const RANGES = [
  { key: '1y',  label: '1Y' },
  { key: '5y',  label: '5Y' },
  { key: '10y', label: '10Y' },
  { key: '20y', label: '20Y' },
  { key: 'max', label: 'MAX' },
];

export default function Macro() {
  const [index, setIndex] = useState<MacroIndexPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<string>('5y');
  const [series, setSeries] = useState<MacroSeriesPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMacroIndex().then(setIndex);
  }, []);

  useEffect(() => {
    if (!selected) { setSeries(null); return; }
    let live = true;
    setLoading(true);
    fetchMacroSeries(selected, range)
      .then(p => { if (live) setSeries(p); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selected, range]);

  const groups = index?.groups ?? {};

  const chartData = useMemo(() => {
    if (!series?.points?.length) return [];
    return series.points
      .filter(p => p.value != null)
      .map(p => ({ date: p.date, value: Number(p.value) }));
  }, [series]);

  const min = chartData.length ? Math.min(...chartData.map(d => d.value)) : 0;
  const max = chartData.length ? Math.max(...chartData.map(d => d.value)) : 0;
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.001;

  return (
    <>
      <Nav />
      <main className="page">
        <div className="markets">
          {Object.entries(groups).map(([groupName, items]) => (
            <div className="group" key={groupName}>
              <h2>{groupName}</h2>
              <div className="macro-list">
                {items.map(it => (
                  <div
                    key={it.id}
                    className={`macro-row ${selected === it.id ? 'active' : ''}`}
                    onClick={() => setSelected(s => s === it.id ? null : it.id)}
                    role="button"
                  >
                    <div className="macro-id">{it.id}</div>
                    <div className="macro-name">{it.name}</div>
                    <div className="macro-units">{it.units}</div>
                    <div className="macro-freq">{it.frequency}</div>
                    <div className="macro-last">{it.last_obs ? new Date(it.last_obs).toLocaleDateString() : '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {selected && (
            <div className="group">
              <div className="sentiment-head">
                <h2>{series?.name ?? selected}</h2>
                <div className="range-tabs">
                  {RANGES.map(r => (
                    <button
                      key={r.key}
                      className={range === r.key ? 'active' : ''}
                      onClick={() => setRange(r.key)}
                    >{r.label}</button>
                  ))}
                </div>
              </div>
              {loading && !chartData.length && <div className="empty-state">Loading…</div>}
              {!loading && !chartData.length && (
                <div className="empty-state">
                  No data for {selected}. Run <code>npm run fred:backfill -- --series {selected}</code>.
                </div>
              )}
              {chartData.length >= 2 && (
                <div style={{ width: '100%', height: 360, opacity: loading ? 0.6 : 1 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                      <defs>
                        <linearGradient id="macro-grad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#4d7cff" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#4d7cff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        stroke="var(--muted)"
                        fontSize={11}
                        minTickGap={50}
                        tickFormatter={d => new Date(d).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
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
                          background: 'var(--bg-3)', border: '1px solid var(--border)',
                          borderRadius: 6, color: 'var(--fg)', fontSize: 12,
                        }}
                        formatter={(v: number) => [fmtNum(v) + (series?.units ? ' ' + series.units : ''), series?.name ?? '']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#4d7cff" strokeWidth={2}
                            fill="url(#macro-grad)" animationDuration={300} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {series && (
                <div className="modal-meta">
                  <span>Series: <strong>{series.id}</strong></span>
                  <span>Units: <strong>{series.units}</strong></span>
                  <span>Frequency: <strong>{series.frequency}</strong></span>
                  <span>Source: <strong>FRED</strong></span>
                  <span>Points: <strong>{chartData.length}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
