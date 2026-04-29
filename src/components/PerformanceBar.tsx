import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketItem } from '../types';
import { fmtPct } from '../format';

interface Props {
  items: MarketItem[];
  title?: string;
  height?: number;
}

export default function PerformanceBar({ items, title = 'Daily % change', height = 300 }: Props) {
  const data = items
    .filter(i => !i.error && i.pct != null)
    .map(i => ({ name: i.name, symbol: i.symbol, pct: i.pct as number }))
    .sort((a, b) => b.pct - a.pct);

  if (!data.length) return null;

  const max = Math.max(...data.map(d => Math.abs(d.pct)));
  const pad = max * 0.1 || 0.1;

  const style = getComputedStyle(document.documentElement);
  const up = style.getPropertyValue('--up').trim() || '#2fd47a';
  const down = style.getPropertyValue('--down').trim() || '#ff5a6a';

  return (
    <div className="perf-bar">
      <h2>{title}</h2>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 110 }}>
            <XAxis
              type="number"
              domain={[-max - pad, max + pad]}
              tickFormatter={v => `${v.toFixed(1)}%`}
              stroke="var(--muted)"
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              stroke="var(--muted)"
              fontSize={11}
              interval={0}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--fg)',
                fontSize: 12,
              }}
              formatter={(v: number) => [fmtPct(v), '% change']}
              cursor={{ fill: 'rgba(76,141,255,0.1)' }}
            />
            <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
              {data.map(d => (
                <Cell key={d.symbol} fill={d.pct >= 0 ? up : down} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
