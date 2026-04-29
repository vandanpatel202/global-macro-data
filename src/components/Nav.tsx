import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/indices', label: 'Indices' },
  { to: '/rates', label: 'Rates' },
  { to: '/commodities', label: 'Commodities' },
  { to: '/fx', label: 'FX' },
  { to: '/crypto', label: 'Crypto' },
  { to: '/macro', label: 'Macro' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/sentiment', label: 'Sentiment' },
];

interface Props {
  updatedAt?: number;
  onRefresh?: () => void;
}

export default function Nav({ updatedAt, onRefresh }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◎</span>
        <h1>Global Macro Dashboard</h1>
      </div>
      <nav className="primary">
        {ITEMS.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {i.label}
          </NavLink>
        ))}
      </nav>
      <div className="meta">
        <span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : ''}</span>
        {onRefresh && <button onClick={onRefresh} title="Refresh">↻</button>}
      </div>
    </header>
  );
}
