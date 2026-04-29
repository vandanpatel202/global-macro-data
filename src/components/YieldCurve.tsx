import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

interface Props {
  items: MarketItem[];
}

export default function YieldCurve({ items }: Props) {
  const points = MATURITY_ORDER
    .map(k => {
      const item = items.find(i => i.symbol === k);
      if (!item || item.error || item.price == null) return null;
      return {
        key: k,
        label: MATURITY_LABEL[k],
        years: MATURITY_YEARS[k],
        yield: item.price,
        prevYield: item.prevClose ?? item.price,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (points.length < 2) return null;

  const yields = points.map(p => p.yield);
  const prev = points.map(p => p.prevYield);
  const min = Math.min(...yields, ...prev);
  const max = Math.max(...yields, ...prev);
  const pad = (max - min) * 0.15 || 0.1;

  return (
    <div className="perf-bar">
      <h2>US Treasury Yield Curve</h2>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              stroke="var(--muted)"
              fontSize={11}
              tickFormatter={v => `${v.toFixed(2)}%`}
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
              formatter={(v: number, name) => [`${v.toFixed(3)}%`, name === 'yield' ? 'Today' : 'Prev close']}
              labelFormatter={l => `Maturity: ${l}`}
            />
            <Line
              type="monotone"
              dataKey="prevYield"
              stroke="var(--muted)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              name="prev"
            />
            <Line
              type="monotone"
              dataKey="yield"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--accent)' }}
              activeDot={{ r: 5 }}
              name="yield"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
