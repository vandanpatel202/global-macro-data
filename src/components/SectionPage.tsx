import { ReactNode, useState } from 'react';
import type { MarketItem, SectionKey } from '../types';
import { useSection } from '../hooks/useSection';
import Nav from './Nav';
import Group from './Group';
import ChartModal from './ChartModal';
import PerformanceBar from './PerformanceBar';

interface Props {
  sectionKey: SectionKey;
  /** Optional extra content to render above the groups (e.g. yield curve). */
  extra?: (items: MarketItem[]) => ReactNode;
  perfBarTitle?: string;
}

export default function SectionPage({ sectionKey, extra, perfBarTitle }: Props) {
  const { data, loading, refresh } = useSection(sectionKey);
  const [selected, setSelected] = useState<MarketItem | null>(null);

  const allItems: MarketItem[] = data
    ? Object.values(data.groups).flat()
    : [];

  const errCount = allItems.filter(i => i.error).length;
  const mostlyFailed = allItems.length > 0 && errCount / allItems.length > 0.8;

  return (
    <>
      <Nav updatedAt={data?.updatedAt} onRefresh={refresh} />
      <main className="page">
        <div className="markets">
          {loading && !data && <div className="empty-state">Loading…</div>}
          {mostlyFailed && (
            <div className="banner">
              Upstream data providers are rate-limiting us (Yahoo 429 / Stooq daily quota).
              Showing last cached values or error tiles. Click ↻ in the nav to force a retry.
            </div>
          )}
          {extra && data && extra(allItems)}
          <PerformanceBar items={allItems} title={perfBarTitle ?? 'Daily % change'} />
          {data &&
            Object.entries(data.groups).map(([group, items]) => (
              <Group key={group} title={group} items={items} onCardClick={setSelected} />
            ))}
        </div>
      </main>
      {selected && <ChartModal item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
