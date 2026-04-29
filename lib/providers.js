// Pure fetch functions for sources the live worker still needs (RSS news,
// Reddit sentiment, Forex Factory calendar). Quote data is sourced exclusively
// from IBKR — see lib/store.js#loadQuoteFromHistory and scripts/ibkr_backfill.py.

import Parser from 'rss-parser';

const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 MacroDash/1.0' },
});

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0 Safari/537.36';

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
