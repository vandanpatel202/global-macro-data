// Pure fetch functions. IBKR is the primary quote source (via the daily
// backfill into per-symbol historical tables — see store.js#loadQuoteFromHistory).
// Yahoo/Stooq below are *only* used as a fallback by the worker when IBKR has
// no data for a symbol (the 30+ international indices / crypto / FX with no
// IBKR market-data subscription on this account).

import Parser from 'rss-parser';

const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 MacroDash/1.0' },
});

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0 Safari/537.36';

// ---------- Yahoo / Stooq fallback (only when IBKR has no data for a symbol) ----------

export async function fetchYahoo(symbol, attempt = 0) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 429 && attempt < 1) {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 200));
    return fetchYahoo(symbol, attempt + 1);
  }
  if (!res.ok) throw new Error(`yahoo ${symbol} status ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo no data for ${symbol}`);
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const pct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const step = Math.max(1, Math.floor(closes.length / 48));
  const spark = closes.filter((_, i) => i % step === 0);
  return {
    price, prevClose, change, pct,
    currency: meta.currency || '', marketState: meta.marketState || '',
    spark, ts: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
    source: 'yahoo',
  };
}

export async function fetchStooq(stooqSymbol) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlc&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stooq ${stooqSymbol} status ${res.status}`);
  const text = await res.text();
  if (/exceeded the daily hits limit/i.test(text)) throw new Error('stooq daily quota exceeded');
  if (!/^Symbol,/i.test(text)) throw new Error(`stooq unexpected body for ${stooqSymbol}`);
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error(`stooq empty ${stooqSymbol}`);
  const [, , , open, , , close] = lines[1].split(',');
  if (open === 'N/D' || close === 'N/D') throw new Error(`stooq N/D ${stooqSymbol}`);
  const o = parseFloat(open), c = parseFloat(close);
  if (!isFinite(o) || !isFinite(c)) throw new Error(`stooq parse ${stooqSymbol}`);
  return {
    price: c, prevClose: o, change: c - o, pct: o ? ((c - o) / o) * 100 : null,
    currency: '', marketState: '', spark: [],
    ts: new Date(), source: 'stooq',
  };
}

export async function fetchFMP(symbol) {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('no FMP_API_KEY');
  const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fmp ${symbol} status ${res.status}`);
  const json = await res.json();
  const q = Array.isArray(json) ? json[0] : null;
  if (!q || typeof q.price !== 'number') throw new Error(`fmp empty for ${symbol}`);
  const prevClose = q.previousClose ?? null;
  return {
    price: q.price, prevClose,
    change: q.change ?? (prevClose != null ? q.price - prevClose : null),
    pct: q.changePercentage ?? null,
    currency: '', marketState: q.exchange || '', spark: [],
    ts: q.timestamp ? new Date(q.timestamp * 1000) : new Date(),
    source: 'fmp',
  };
}

// Try Yahoo → Stooq → FMP. Used by the worker as a last-resort fallback when
// the IBKR-backed historical table is empty for a symbol.
export async function fetchQuoteFallback(meta) {
  const errors = [];
  if (meta.yahoo) {
    try { return await fetchYahoo(meta.yahoo); }
    catch (e) { errors.push(`yahoo: ${e.message}`); }
  }
  if (meta.stooq) {
    try { return await fetchStooq(meta.stooq); }
    catch (e) { errors.push(`stooq: ${e.message}`); }
  }
  if (meta.fmp && process.env.FMP_API_KEY) {
    try { return await fetchFMP(meta.fmp); }
    catch (e) { errors.push(`fmp: ${e.message}`); }
  }
  throw new Error(errors.join(' | ') || 'no fallback providers');
}

// ---------- Reddit (anonymous .json endpoints) ----------

const REDDIT_UA = 'macro-dashboard/0.1 (sentiment scraper)';

export async function fetchRedditNew(subreddit, limit = 100) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': REDDIT_UA } });
  if (!res.ok) throw new Error(`reddit ${subreddit} status ${res.status}`);
  const json = await res.json();
  const children = json?.data?.children || [];
  return children.map(c => {
    const d = c.data || {};
    return {
      id: d.name,
      source: `reddit:${subreddit}`,
      title: d.title || '',
      body: d.selftext || '',
      url: d.url || `https://reddit.com${d.permalink || ''}`,
      author: d.author || '',
      score: typeof d.score === 'number' ? d.score : null,
      numComments: typeof d.num_comments === 'number' ? d.num_comments : null,
      createdAt: new Date(((d.created_utc || 0) * 1000) || Date.now()),
    };
  }).filter(p => p.id);
}

// ---------- Economic calendar (Forex Factory weekly XML) ----------

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';

// Forex Factory times are US Eastern (ET). Convert to UTC by offset.
// Approx fixed offset; we accept the small DST-edge inaccuracy since the
// values are also approximate ("Tentative", "All Day").
const ET_OFFSET_MS = 4 * 60 * 60 * 1000; // EDT (-04:00). Close enough.

function parseFFTime(dateStr, timeStr) {
  // dateStr: 'MM-DD-YYYY', timeStr: e.g. '8:00pm', '11:00am', 'All Day', 'Tentative'
  if (!dateStr) return { date: null, ts: null };
  const m = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return { date: null, ts: null };
  const isoDate = `${m[3]}-${m[1]}-${m[2]}`;
  if (!timeStr || /all day|tentative|day \d/i.test(timeStr)) {
    return { date: isoDate, ts: null };
  }
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!tm) return { date: isoDate, ts: null };
  let h = parseInt(tm[1], 10);
  const min = parseInt(tm[2], 10);
  const pm = tm[3].toLowerCase() === 'pm';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  const localMs = Date.UTC(+m[3], +m[1] - 1, +m[2], h, min);
  // Local was ET, so add offset to get UTC.
  return { date: isoDate, ts: new Date(localMs + ET_OFFSET_MS) };
}

export async function fetchCalendarEvents() {
  const res = await fetch(CALENDAR_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`calendar status ${res.status}`);
  const xml = await res.text();
  // Parse `<event>…</event>` blocks. The XML is small and well-formed enough
  // for a regex pull rather than dragging in a parser.
  const out = [];
  const eventRe = /<event>([\s\S]*?)<\/event>/g;
  const fieldRe = (name) => new RegExp(`<${name}(?:\\s*/>|>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${name}>)`, 'i');
  let m;
  while ((m = eventRe.exec(xml)) !== null) {
    const block = m[1];
    const f = (n) => {
      const r = fieldRe(n).exec(block);
      if (!r) return '';
      return (r[1] ?? r[2] ?? '').trim();
    };
    const title = f('title');
    const country = f('country');
    const dateStr = f('date');
    const timeStr = f('time');
    const impact = f('impact');
    const forecast = f('forecast');
    const previous = f('previous');
    const url = f('url');
    if (!title || !country || !dateStr) continue;
    const { date, ts } = parseFFTime(dateStr, timeStr);
    if (!date) continue;
    out.push({
      title, country, scheduledDate: date, scheduledAt: ts,
      timeLabel: timeStr || null, impact: impact || null,
      forecast: forecast || null, previous: previous || null, url: url || null,
    });
  }
  return out;
}

// ---------- News (RSS) ----------

export async function fetchFeeds(feeds) {
  const results = await Promise.allSettled(feeds.map(async f => {
    const feed = await rssParser.parseURL(f.url);
    return (feed.items || []).slice(0, 12).map(it => ({
      source: f.source,
      title: (it.title || '').trim(),
      link: it.link || it.guid || '',
      publishedAt: it.isoDate || it.pubDate || null,
      snippet: (it.contentSnippet || it.content || '').slice(0, 240),
    }));
  }));
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(it => it.title && it.link);
}
