import { useEffect, useState } from 'react';
import Nav from '../components/Nav';
import Card from '../components/Card';
import ChartModal from '../components/ChartModal';
import NewsPanel from '../components/NewsPanel';
import PerformanceBar from '../components/PerformanceBar';
import type { MarketItem, OverviewPayload } from '../types';
import { fetchOverview, getCachedOverview } from '../api';

export default function Overview() {
  const seed = getCachedOverview();
  const [data, setData] = useState<OverviewPayload | null>(seed?.data ?? null);
  const [selected, setSelected] = useState<MarketItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    const cached = getCachedOverview();
    if (cached) setData(cached.data);

    const load = async () => {
      try {
        const payload = await fetchOverview();
        if (live) setData(payload);
      } catch (e) {
        console.error(e);
      }
    };
    if (!cached?.fresh) load();
    const id = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [reloadKey]);

  const tiles = data?.tiles ?? [];

  return (
    <>
      <Nav updatedAt={data?.updatedAt} onRefresh={() => setReloadKey(k => k + 1)} />
      <main className="page with-news">
        <section>
          <div className="group">
            <h2>Headline Tiles</h2>
            <div className="cards">
              {tiles.map(t => (
                <Card key={t.symbol} item={t} onClick={setSelected} />
              ))}
              {!tiles.length && <div className="empty-state">Loading…</div>}
            </div>
          </div>
          <div style={{ height: 16 }} />
          {tiles.length > 0 && <PerformanceBar items={tiles} title="Headline movers" height={360} />}
        </section>
        <NewsPanel />
      </main>
      {selected && <ChartModal item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
