import type {
  FuturesPayload,
  FuturesRoot,
  CalendarPayload,
  HistoryPayload,
  HistoryRange,
  MacroIndexPayload,
  MacroSeriesPayload,
  NewsPayload,
  OverviewPayload,
  SectionKey,
  SectionPayload,
  TickerPostsPayload,
  TrendingPayload,
} from './types';

// In-memory client cache so nav between pages is instant. Server already has its
// own 60s cache; this avoids the round-trip entirely when we already have data.
const sectionCache = new Map<SectionKey, { data: SectionPayload; ts: number }>();
let overviewCache: { data: OverviewPayload; ts: number } | null = null;
let newsCache: { data: NewsPayload; ts: number } | null = null;

const STALE_MS = 60_000; // match server cache; beyond this we show stale data AND revalidate

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchSection(key: SectionKey, force = false): Promise<SectionPayload> {
  const url = force ? `/api/markets/${key}?nocache=1` : `/api/markets/${key}`;
  const data = await getJSON<SectionPayload>(url);
  sectionCache.set(key, { data, ts: Date.now() });
  return data;
}

export function getCachedSection(key: SectionKey): { data: SectionPayload; fresh: boolean } | null {
  const hit = sectionCache.get(key);
  if (!hit) return null;
  return { data: hit.data, fresh: Date.now() - hit.ts < STALE_MS };
}

export async function fetchOverview(): Promise<OverviewPayload> {
  const data = await getJSON<OverviewPayload>('/api/overview');
  overviewCache = { data, ts: Date.now() };
  return data;
}

export function getCachedOverview(): { data: OverviewPayload; fresh: boolean } | null {
  if (!overviewCache) return null;
  return { data: overviewCache.data, fresh: Date.now() - overviewCache.ts < STALE_MS };
}

export async function fetchNews(): Promise<NewsPayload> {
  const data = await getJSON<NewsPayload>('/api/news');
  newsCache = { data, ts: Date.now() };
  return data;
}

export function getCachedNews(): { data: NewsPayload; fresh: boolean } | null {
  if (!newsCache) return null;
  return { data: newsCache.data, fresh: Date.now() - newsCache.ts < STALE_MS };
}

/** Warm the caches for every section, fire-and-forget. */
export function prefetchAll(): void {
  const keys: SectionKey[] = ['indices', 'rates', 'commodities', 'fx', 'crypto'];
  for (const k of keys) {
    if (!sectionCache.has(k)) fetchSection(k).catch(() => void 0);
  }
  if (!overviewCache) fetchOverview().catch(() => void 0);
  if (!newsCache) fetchNews().catch(() => void 0);
}

// ---------- Futures forward curves ----------
const futuresCache = new Map<string, { data: FuturesPayload; ts: number }>();
let futuresRootsCache: FuturesRoot[] | null = null;
const FUTURES_STALE_MS = 10 * 60_000; // match server 10min

export async function fetchFuturesRoots(): Promise<FuturesRoot[]> {
  if (futuresRootsCache) return futuresRootsCache;
  const data = await getJSON<FuturesRoot[]>('/api/futures');
  futuresRootsCache = data;
  return data;
}

export async function fetchFutures(root: string): Promise<FuturesPayload> {
  const data = await getJSON<FuturesPayload>(`/api/futures/${root}`);
  futuresCache.set(root, { data, ts: Date.now() });
  return data;
}

export function getCachedFutures(root: string): { data: FuturesPayload; fresh: boolean } | null {
  const hit = futuresCache.get(root);
  if (!hit) return null;
  return { data: hit.data, fresh: Date.now() - hit.ts < FUTURES_STALE_MS };
}

// ---------- History (per-symbol historical OHLC) ----------
const historyCache = new Map<string, { data: HistoryPayload; ts: number }>();
const HISTORY_STALE_MS = 5 * 60_000;

export async function fetchHistory(symbol: string, range: HistoryRange): Promise<HistoryPayload> {
  const key = `${symbol}|${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < HISTORY_STALE_MS) return cached.data;
  const data = await getJSON<HistoryPayload>(`/api/history/${encodeURIComponent(symbol)}?range=${range}`);
  historyCache.set(key, { data, ts: Date.now() });
  return data;
}

// ---------- Economic calendar ----------
export async function fetchCalendar(opts: { country?: string; impact?: string } = {}): Promise<CalendarPayload> {
  const qs = new URLSearchParams();
  if (opts.country) qs.set('country', opts.country);
  if (opts.impact) qs.set('impact', opts.impact);
  const q = qs.toString();
  return getJSON<CalendarPayload>(`/api/calendar${q ? '?' + q : ''}`);
}

// ---------- Macro / FRED ----------
export async function fetchMacroIndex(): Promise<MacroIndexPayload> {
  return getJSON<MacroIndexPayload>('/api/macro/series');
}

export async function fetchMacroSeries(id: string, range: string = '5y'): Promise<MacroSeriesPayload> {
  return getJSON<MacroSeriesPayload>(`/api/macro/series/${encodeURIComponent(id)}?range=${range}`);
}

// ---------- Sentiment ----------
export async function fetchTrending(window: string = '24h'): Promise<TrendingPayload> {
  return getJSON<TrendingPayload>(`/api/sentiment/trending?window=${encodeURIComponent(window)}`);
}

export async function fetchTickerPosts(ticker: string, window: string = '24h'): Promise<TickerPostsPayload> {
  return getJSON<TickerPostsPayload>(
    `/api/sentiment/ticker/${encodeURIComponent(ticker)}?window=${encodeURIComponent(window)}`
  );
}
