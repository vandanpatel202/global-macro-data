import { useEffect, useState } from 'react';
import type { NewsItem, NewsPayload } from '../types';
import { fetchNews, getCachedNews } from '../api';
import { timeAgo } from '../format';

export default function NewsPanel() {
  const seed = getCachedNews();
  const [items, setItems] = useState<NewsItem[]>(seed?.data.items ?? []);
  const [sources, setSources] = useState<string[]>(seed?.data.sources ?? []);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!seed);

  useEffect(() => {
    let live = true;
    const cached = getCachedNews();
    if (cached) {
      setItems(cached.data.items || []);
      setSources(cached.data.sources || []);
      setLoading(false);
    }
    const load = async () => {
      try {
        const data: NewsPayload = await fetchNews();
        if (!live) return;
        setItems(data.items || []);
        setSources(data.sources || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (live) setLoading(false);
      }
    };
    if (!cached?.fresh) load();
    const id = setInterval(load, 180_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const toggle = (key: string) => {
    if (key === '__all') {
      setActive(new Set());
      return;
    }
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const shown = active.size === 0 ? items : items.filter(it => active.has(it.source));

  return (
    <aside className="news">
      <div className="news-head">
        <h2>Macro News</h2>
        <div className="filters">
          <button
            className={`filter-chip${active.size === 0 ? ' active' : ''}`}
            onClick={() => toggle('__all')}
          >
            All
          </button>
          {sources.map(s => (
            <button
              key={s}
              className={`filter-chip${active.has(s) ? ' active' : ''}`}
              onClick={() => toggle(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="empty-state">Loading news…</div>}
      {!loading && !shown.length && <div className="empty-state">No items</div>}
      <ul className="news-list">
        {shown.slice(0, 80).map(it => (
          <li key={it.link}>
            <a href={it.link} target="_blank" rel="noopener noreferrer">{it.title}</a>
            <div className="news-meta">
              <span className="news-source">{it.source}</span>
              <span>{timeAgo(it.isoDate)}</span>
            </div>
            {it.contentSnippet && <div className="news-snippet">{it.contentSnippet}</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
