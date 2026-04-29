import { useEffect, useState } from 'react';
import Nav from '../components/Nav';
import { fetchTrending, fetchTickerPosts } from '../api';
import type { TrendingPayload, TickerPostsPayload } from '../types';

const WINDOWS = [
  { key: '6h',  label: '6H' },
  { key: '12h', label: '12H' },
  { key: '24h', label: '24H' },
  { key: '7d',  label: '7D' },
];

export default function Sentiment() {
  const [window, setWindow] = useState<string>('24h');
  const [data, setData] = useState<TrendingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [posts, setPosts] = useState<TickerPostsPayload | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchTrending(window)
      .then(p => { if (live) setData(p); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [window, reload]);

  useEffect(() => {
    if (!selected) { setPosts(null); return; }
    let live = true;
    fetchTickerPosts(selected, window).then(p => { if (live) setPosts(p); });
    return () => { live = false; };
  }, [selected, window]);

  const items = data?.items ?? [];
  const max = items.length ? Math.max(...items.map(i => i.mentions)) : 1;

  return (
    <>
      <Nav updatedAt={data?.updatedAt} onRefresh={() => setReload(k => k + 1)} />
      <main className="page">
        <div className="markets">
          <div className="group">
            <div className="sentiment-head">
              <h2>Trending tickers (Reddit retail)</h2>
              <div className="range-tabs">
                {WINDOWS.map(w => (
                  <button
                    key={w.key}
                    className={window === w.key ? 'active' : ''}
                    onClick={() => setWindow(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {loading && !items.length && <div className="empty-state">Loading…</div>}
            {!loading && !items.length && (
              <div className="empty-state">
                No ticker mentions yet. Worker polls r/wallstreetbets, r/stocks, and r/options
                every 10 min — give it a minute, then refresh.
              </div>
            )}
            {items.length > 0 && (
              <div className="trending-list">
                {items.map(it => (
                  <div
                    key={it.ticker}
                    className={`trending-row ${selected === it.ticker ? 'active' : ''}`}
                    onClick={() => setSelected(s => s === it.ticker ? null : it.ticker)}
                    role="button"
                  >
                    <div className="trending-ticker">${it.ticker}</div>
                    <div className="trending-bar">
                      <div className="trending-bar-fill" style={{ width: `${(it.mentions / max) * 100}%` }} />
                    </div>
                    <div className="trending-count">{it.mentions} mentions</div>
                    <div className="trending-posts">{it.posts} posts</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && posts && (
            <div className="group">
              <h2>Recent ${selected} posts ({posts.window})</h2>
              {posts.posts.length === 0 && <div className="empty-state">No posts found.</div>}
              <div className="posts-list">
                {posts.posts.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="post-row">
                    <div className="post-title">{p.title}</div>
                    <div className="post-meta">
                      <span>{p.source}</span>
                      <span>{p.author}</span>
                      <span>{p.score ?? '—'} ▲</span>
                      <span>{p.numComments ?? '—'} 💬</span>
                      <span>{new Date(p.createdAt).toLocaleString()}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
