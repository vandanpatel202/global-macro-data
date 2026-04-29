import { useEffect, useMemo, useRef, useState } from 'react';
import type { NewsItem, NewsPayload } from '../types';
import { fetchNews, getCachedNews } from '../api';
import { timeAgo } from '../format';

export default function NewsPanel() {
  const seed = getCachedNews();
  const [items, setItems] = useState<NewsItem[]>(seed?.data.items ?? []);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!seed);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const seenSources = useRef<Set<string>>(new Set());

  // Track sources we've ever seen so the chip list doesn't shrink mid-search.
  for (const it of items) seenSources.current.add(it.source);

  // Debounce query → debounced (300ms)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Refetch when debounced query changes, on initial load, and every 3 min.
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data: NewsPayload = await fetchNews(debounced ? { q: debounced } : {});
        if (!live) return;
        setItems(data.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (live) setLoading(false);
      }
    };
    setLoading(true);
    load();
    // Poll every 3 min only when not searching (search is on-demand).
    if (!debounced) {
      const id = setInterval(load, 180_000);
      return () => { live = false; clearInterval(id); };
    }
    return () => { live = false; };
  }, [debounced]);

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

  const sources = useMemo(() => Array.from(seenSources.current).sort(), [items]);
  const shown = active.size === 0 ? items : items.filter(it => active.has(it.source));

  return (
    <aside className="news">
      <div className="news-head">
        <h2>Macro News</h2>
        <div className="news-search">
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <button onClick={() => setQuery('')} className="news-clear" aria-label="Clear">×</button>}
        </div>
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
      {!loading && !shown.length && (
        <div className="empty-state">{debounced ? `No matches for “${debounced}”` : 'No items'}</div>
      )}
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
