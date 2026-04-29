import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CurveShape, FuturesPayload, FuturesRoot } from '../types';
import { fetchFutures, fetchFuturesRoots, getCachedFutures } from '../api';
import { fmtNum } from '../format';

const SHAPE_STYLES: Record<CurveShape, { label: string; color: string; hint: string }> = {
  contango:       { label: 'Contango',       color: 'var(--down)', hint: 'forward prices above spot (cost of carry / oversupply)' },
  backwardation:  { label: 'Backwardation',  color: 'var(--up)',   hint: 'forward prices below spot (tight physical / squeeze)' },
  flat:           { label: 'Flat curve',     color: 'var(--muted)',hint: 'little shape across contracts' },
  mixed:          { label: 'Mixed',          color: 'var(--muted)',hint: 'non-monotonic / seasonal curve' },
};

export default function ForwardCurve() {
  const [roots, setRoots] = useState<FuturesRoot[]>([]);
  const [root, setRoot] = useState<string>('CL');
  const seed = getCachedFutures(root);
  const [data, setData] = useState<FuturesPayload | null>(seed?.data ?? null);
  const [loading, setLoading] = useState(!seed);

  useEffect(() => {
    fetchFuturesRoots().then(setRoots).catch(console.error);
  }, []);

  useEffect(() => {
    let live = true;
    const cached = getCachedFutures(root);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (cached.fresh) return () => { live = false; };
    } else {
      setData(null);
      setLoading(true);
    }
    fetchFutures(root)
      .then(d => { if (live) { setData(d); setLoading(false); } })
      .catch(e => { if (live) { console.error(e); setLoading(false); } });
    return () => { live = false; };
  }, [root]);

  const points = data?.points ?? [];
  const shape = data?.shape ?? 'mixed';
  const shapeMeta = SHAPE_STYLES[shape];

  const prices = points.map(p => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.01;

  return (
    <div className="perf-bar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Forward Curve</h2>
          <select
            value={root}
            onChange={e => setRoot(e.target.value)}
            style={{
              background: 'var(--bg-3)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            {(roots.length ? roots : [{ root: 'CL', label: 'WTI Crude', unit: '$/bbl' }]).map(r => (
              <option key={r.root} value={r.root}>{r.label}</option>
            ))}
          </select>
          {data && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {data.unit} · {points.length} contracts
            </span>
          )}
        </div>
        {data && (
          <div title={shapeMeta.hint} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: 'var(--bg-3)',
              border: `1px solid ${shapeMeta.color}`,
              color: shapeMeta.color,
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}>
              {shapeMeta.label.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {loading && !points.length && <div className="empty-state">Loading forward curve… (Yahoo throttling may take a few seconds)</div>}
      {!loading && !points.length && <div className="empty-state">No forward contracts available right now. Try again in a minute.</div>}

      {points.length >= 2 && (
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                height={60}
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
                formatter={(v: number) => [`${fmtNum(v)} ${data?.unit ?? ''}`, 'Price']}
                labelFormatter={l => `Expiry: ${l}`}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={shapeMeta.color}
                strokeWidth={2}
                dot={{ r: 3, fill: shapeMeta.color }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
