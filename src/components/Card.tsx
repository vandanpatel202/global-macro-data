import type { MarketItem } from '../types';
import { dirClass, fmtChg, fmtNum, fmtPct } from '../format';
import Sparkline from './Sparkline';

interface Props {
  item: MarketItem;
  onClick?: (item: MarketItem) => void;
}

export default function Card({ item, onClick }: Props) {
  const err = item.error || item.price == null;
  const handleClick = () => {
    if (err) return;
    onClick?.(item);
  };

  return (
    <div className={`card${err ? ' err' : ''}`} onClick={handleClick} role={err ? undefined : 'button'}>
      {item.source && <div className="card-src">{item.source}</div>}
      <div className="card-top">
        <div>
          <div className="card-name">{item.name}</div>
          <div className="card-sym">{item.symbol}</div>
        </div>
        <div className="card-region">{item.region}</div>
      </div>
      <div className="card-price">{err ? '—' : fmtNum(item.price)}</div>
      <div className={`card-change ${dirClass(item.change)}`}>
        {err ? 'n/a' : `${fmtChg(item.change)}  (${fmtPct(item.pct)})`}
      </div>
      {!err && <Sparkline data={item.spark} up={(item.change ?? 0) >= 0} />}
    </div>
  );
}
