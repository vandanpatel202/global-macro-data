import type { MarketItem } from '../types';
import Card from './Card';

interface Props {
  title: string;
  items: MarketItem[];
  onCardClick?: (item: MarketItem) => void;
}

export default function Group({ title, items, onCardClick }: Props) {
  if (!items.length) return null;
  return (
    <div className="group">
      <h2>{title}</h2>
      <div className="cards">
        {items.map(it => (
          <Card key={it.symbol} item={it} onClick={onCardClick} />
        ))}
      </div>
    </div>
  );
}
