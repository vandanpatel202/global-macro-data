// All Postgres reads/writes for the live dashboard. Keeps SQL out of server.js
// and out of the worker.

export async function upsertQuote(pool, symbol, q) {
  await pool.query(
    `INSERT INTO meta.quotes
       (symbol, price, prev_close, change, pct, currency, market_state, spark, source, ts, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,now())
     ON CONFLICT (symbol) DO UPDATE SET
       price = EXCLUDED.price, prev_close = EXCLUDED.prev_close,
       change = EXCLUDED.change, pct = EXCLUDED.pct,
       currency = EXCLUDED.currency, market_state = EXCLUDED.market_state,
       spark = EXCLUDED.spark, source = EXCLUDED.source,
       ts = EXCLUDED.ts, updated_at = now()`,
    [symbol, q.price, q.prevClose, q.change, q.pct,
     q.currency || '', q.marketState || '',
     JSON.stringify(q.spark || []),
     q.source || null,
     q.ts || new Date()]
  );
  await pool.query(
    `UPDATE meta.symbols SET last_quote_at = now() WHERE symbol = $1`,
    [symbol]
  );
}

export async function markSymbolError(pool, symbol) {
  // Bump last_quote_at even on failure, so we don't spin on the same broken
  // symbol. Real success will overwrite the row in meta.quotes.
  await pool.query(
    `UPDATE meta.symbols SET last_quote_at = now() WHERE symbol = $1`,
    [symbol]
  );
}

// Pull the latest daily bar (and last 30 closes for the spark) from the
// per-symbol IBKR-backfilled historical OHLC table. Returns the same shape as
// the old upstream-provider response so upsertQuote stays unchanged. Returns
// null if the table is empty for the symbol.
export async function loadQuoteFromHistory(pool, sym) {
  const closeCol = sym.section === 'rates' ? '"yield"' : 'close';
  let rows;
  try {
    const r = await pool.query(
      `SELECT date, ${closeCol} AS close FROM ${sym.schema_name}.${sym.table_name}
       ORDER BY date DESC LIMIT 30`
    );
    rows = r.rows;
  } catch (e) {
    return null;
  }
  if (!rows || rows.length === 0) return null;
  const last = rows[0];
  const prev = rows[1] || {};
  const price = last.close != null ? Number(last.close) : null;
  if (price == null) return null;
  const prevClose = prev.close != null ? Number(prev.close) : null;
  const change = prevClose != null ? price - prevClose : null;
  const pct = prevClose ? (change / prevClose) * 100 : null;
  // Reverse so spark goes oldest → newest (left → right on the chart)
  const spark = rows.slice().reverse().map(r => Number(r.close));
  return {
    price, prevClose, change, pct,
    currency: '', marketState: '', spark,
    source: 'ibkr', ts: last.date,
  };
}

// Pick one due-for-refresh symbol, preferring tier 1 then oldest.
// Returns null if nothing is due — the worker sleeps and retries.
export async function pickDueSymbol(pool) {
  const r = await pool.query(`
    SELECT symbol, name, section, group_name, region, schema_name, table_name,
           yahoo, stooq, fmp, awesome, coingecko, tier, is_future
    FROM meta.symbols
    WHERE last_quote_at IS NULL
       OR (tier = 1 AND last_quote_at < now() - interval '60 seconds')
       OR (tier = 2 AND last_quote_at < now() - interval '600 seconds')
    ORDER BY tier ASC, last_quote_at ASC NULLS FIRST
    LIMIT 1
  `);
  return r.rows[0] || null;
}

// Section payload, served by /api/markets/:section. Pulls the cached quotes
// joined with the registry and groups by group_name to match the legacy shape.
export async function getSectionFromDb(pool, section) {
  const r = await pool.query(`
    SELECT s.symbol, s.name, s.section, s.group_name AS "group", s.region,
           s.yahoo AS y, s.stooq AS s_stooq, s.fmp AS f, s.awesome AS a, s.coingecko AS cg,
           q.price, q.prev_close AS "prevClose", q.change, q.pct,
           q.currency, q.market_state AS "marketState", q.spark, q.source, q.ts,
           q.updated_at
    FROM meta.symbols s
    LEFT JOIN meta.quotes q ON q.symbol = s.symbol
    WHERE s.section = $1 AND s.is_future = false
    ORDER BY s.group_name, s.symbol
  `, [section]);

  const groups = {};
  let updatedAt = 0;
  for (const row of r.rows) {
    const grp = row.group;
    if (!groups[grp]) groups[grp] = [];
    const item = {
      symbol: row.symbol, name: row.name, region: row.region, group: grp,
      y: row.y, s: row.s_stooq, f: row.f, a: row.a, cg: row.cg,
    };
    if (row.price != null) {
      item.price = Number(row.price);
      item.prevClose = row.prevClose != null ? Number(row.prevClose) : null;
      item.change = row.change != null ? Number(row.change) : null;
      item.pct = row.pct != null ? Number(row.pct) : null;
      item.currency = row.currency || '';
      item.marketState = row.marketState || '';
      item.spark = row.spark || [];
      item.source = row.source || null;
      item.ts = row.ts ? new Date(row.ts).getTime() : null;
      const u = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (u > updatedAt) updatedAt = u;
    } else {
      item.error = true;
    }
    groups[grp].push(item);
  }
  return { key: section, groups, updatedAt: updatedAt || Date.now() };
}

export async function getOverviewTilesFromDb(pool, headlineSymbols) {
  const r = await pool.query(`
    SELECT s.symbol, s.name, s.section, s.group_name AS "group", s.region,
           q.price, q.prev_close AS "prevClose", q.change, q.pct,
           q.currency, q.market_state AS "marketState", q.spark, q.source, q.ts,
           q.updated_at
    FROM meta.symbols s
    LEFT JOIN meta.quotes q ON q.symbol = s.symbol
    WHERE s.symbol = ANY($1)
  `, [headlineSymbols]);

  const bySymbol = new Map(r.rows.map(row => [row.symbol, row]));
  let updatedAt = 0;
  const tiles = [];
  for (const sym of headlineSymbols) {
    const row = bySymbol.get(sym);
    if (!row) continue;
    const item = { symbol: row.symbol, name: row.name, region: row.region, group: row.group };
    if (row.price != null) {
      item.price = Number(row.price);
      item.prevClose = row.prevClose != null ? Number(row.prevClose) : null;
      item.change = row.change != null ? Number(row.change) : null;
      item.pct = row.pct != null ? Number(row.pct) : null;
      item.currency = row.currency || '';
      item.marketState = row.marketState || '';
      item.spark = row.spark || [];
      item.source = row.source || null;
      item.ts = row.ts ? new Date(row.ts).getTime() : null;
      const u = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (u > updatedAt) updatedAt = u;
      tiles.push(item);
    }
  }
  return { tiles, updatedAt: updatedAt || Date.now() };
}

// ---------- News ----------

export async function insertArticles(pool, items) {
  if (!items.length) return 0;
  let inserted = 0;
  // Small batches keep the parameter list manageable.
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const placeholders = chunk.map((_, j) => {
      const k = j * 5;
      return `($${k+1},$${k+2},$${k+3},$${k+4},$${k+5})`;
    }).join(',');
    const vals = chunk.flatMap(it => [
      it.source, it.title, it.link,
      it.publishedAt ? new Date(it.publishedAt) : null,
      it.snippet || null,
    ]);
    const r = await pool.query(
      `INSERT INTO news.articles (source, title, link, published_at, snippet)
       VALUES ${placeholders}
       ON CONFLICT (link) DO NOTHING`,
      vals
    );
    inserted += r.rowCount;
  }
  return inserted;
}

export async function getNews(pool, { limit = 120, q = null, sources = null } = {}) {
  const where = [];
  const args = [];
  if (q) {
    args.push(q);
    where.push(`search_tsv @@ plainto_tsquery('english', $${args.length})`);
  }
  if (sources && sources.length) {
    args.push(sources);
    where.push(`source = ANY($${args.length})`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const orderSql = q
    ? `ORDER BY ts_rank(search_tsv, plainto_tsquery('english', $1)) DESC, published_at DESC NULLS LAST`
    : `ORDER BY published_at DESC NULLS LAST, inserted_at DESC`;
  args.push(limit);
  const r = await pool.query(
    `SELECT source, title, link, published_at, snippet
     FROM news.articles ${whereSql} ${orderSql} LIMIT $${args.length}`,
    args
  );
  return r.rows.map(row => ({
    source: row.source,
    title: row.title,
    link: row.link,
    isoDate: row.published_at ? new Date(row.published_at).toISOString() : null,
    contentSnippet: row.snippet || '',
  }));
}

export async function countQuotes(pool) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM meta.quotes`);
  return r.rows[0].n;
}

export async function countArticles(pool) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM news.articles`);
  return r.rows[0].n;
}

// ---------- Sentiment ----------

export async function insertPostsAndMentions(pool, posts, mentionsByPostId) {
  if (!posts.length) return { posts: 0, mentions: 0 };
  let postsInserted = 0;
  let mentionsInserted = 0;
  // Posts
  for (let i = 0; i < posts.length; i += 50) {
    const chunk = posts.slice(i, i + 50);
    const ph = chunk.map((_, j) => {
      const k = j * 9;
      return `($${k+1},$${k+2},$${k+3},$${k+4},$${k+5},$${k+6},$${k+7},$${k+8},$${k+9})`;
    }).join(',');
    const vals = chunk.flatMap(p => [
      p.id, p.source, p.title, p.body || null, p.url || null,
      p.author || null, p.score, p.numComments, p.createdAt,
    ]);
    const r = await pool.query(
      `INSERT INTO sentiment.posts
         (id, source, title, body, url, author, score, num_comments, created_at)
       VALUES ${ph}
       ON CONFLICT (id) DO UPDATE SET
         score = EXCLUDED.score, num_comments = EXCLUDED.num_comments`,
      vals
    );
    postsInserted += r.rowCount;
  }
  // Mentions
  const mentionRows = [];
  for (const post of posts) {
    const tickers = mentionsByPostId.get(post.id) || [];
    for (const t of tickers) {
      mentionRows.push({ post_id: post.id, ticker: t, source: post.source, created_at: post.createdAt });
    }
  }
  for (let i = 0; i < mentionRows.length; i += 100) {
    const chunk = mentionRows.slice(i, i + 100);
    const ph = chunk.map((_, j) => {
      const k = j * 4;
      return `($${k+1},$${k+2},$${k+3},$${k+4})`;
    }).join(',');
    const vals = chunk.flatMap(m => [m.post_id, m.ticker, m.source, m.created_at]);
    const r = await pool.query(
      `INSERT INTO sentiment.mentions (post_id, ticker, source, created_at)
       VALUES ${ph}
       ON CONFLICT (post_id, ticker) DO NOTHING`,
      vals
    );
    mentionsInserted += r.rowCount;
  }
  return { posts: postsInserted, mentions: mentionsInserted };
}

export async function getTrendingTickers(pool, hours = 24, limit = 30) {
  const r = await pool.query(`
    SELECT m.ticker,
           COUNT(*)::int                AS mentions,
           COUNT(DISTINCT m.post_id)::int AS posts,
           MAX(m.created_at)             AS last_seen
    FROM sentiment.mentions m
    WHERE m.created_at > now() - ($1 || ' hours')::interval
    GROUP BY m.ticker
    ORDER BY mentions DESC
    LIMIT $2
  `, [String(hours), limit]);
  return r.rows.map(row => ({
    ticker: row.ticker,
    mentions: row.mentions,
    posts: row.posts,
    lastSeen: row.last_seen,
  }));
}

export async function getPostsForTicker(pool, ticker, hours = 24, limit = 30) {
  const r = await pool.query(`
    SELECT p.id, p.source, p.title, p.url, p.author, p.score, p.num_comments, p.created_at
    FROM sentiment.mentions m
    JOIN sentiment.posts p ON p.id = m.post_id
    WHERE m.ticker = $1 AND m.created_at > now() - ($2 || ' hours')::interval
    ORDER BY p.score DESC NULLS LAST, p.created_at DESC
    LIMIT $3
  `, [ticker, String(hours), limit]);
  return r.rows.map(row => ({
    id: row.id, source: row.source, title: row.title, url: row.url,
    author: row.author, score: row.score, numComments: row.num_comments,
    createdAt: row.created_at,
  }));
}

export async function countSentimentPosts(pool) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM sentiment.posts`);
  return r.rows[0].n;
}

export async function countSentimentMentions(pool) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM sentiment.mentions`);
  return r.rows[0].n;
}

// ---------- Economic calendar ----------

export async function upsertCalendarEvents(pool, events) {
  if (!events.length) return 0;
  // Dedup within the batch on (country, date, title) — Postgres rejects
  // ON CONFLICT DO UPDATE that hits the same row twice in one statement.
  const seen = new Map();
  for (const e of events) {
    const k = `${e.country}|${e.scheduledDate}|${e.title}`;
    if (!seen.has(k)) seen.set(k, e);
  }
  const unique = [...seen.values()];
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const ph = chunk.map((_, j) => {
      const k = j * 9;
      return `($${k+1},$${k+2},$${k+3},$${k+4},$${k+5},$${k+6},$${k+7},$${k+8},$${k+9})`;
    }).join(',');
    const vals = chunk.flatMap(e => [
      e.title, e.country, e.scheduledAt, e.scheduledDate,
      e.timeLabel, e.impact, e.forecast, e.previous, e.url,
    ]);
    const r = await pool.query(
      `INSERT INTO calendar.events
         (title, country, scheduled_at, scheduled_date, time_label, impact, forecast, previous, url)
       VALUES ${ph}
       ON CONFLICT (country, scheduled_date, title) DO UPDATE SET
         scheduled_at = EXCLUDED.scheduled_at,
         time_label   = EXCLUDED.time_label,
         impact       = EXCLUDED.impact,
         forecast     = EXCLUDED.forecast,
         previous     = EXCLUDED.previous,
         url          = EXCLUDED.url,
         fetched_at   = now()`,
      vals
    );
    inserted += r.rowCount;
  }
  return inserted;
}

export async function getCalendarEvents(pool, opts = {}) {
  const { fromDate, toDate, country, impact } = opts;
  const where = []; const args = [];
  if (fromDate) { args.push(fromDate); where.push(`scheduled_date >= $${args.length}`); }
  if (toDate)   { args.push(toDate);   where.push(`scheduled_date <= $${args.length}`); }
  if (country)  { args.push(country);  where.push(`country = $${args.length}`); }
  if (impact)   { args.push(impact);   where.push(`impact = $${args.length}`); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const r = await pool.query(
    `SELECT id, title, country, scheduled_at, scheduled_date, time_label,
            impact, forecast, previous, url
     FROM calendar.events
     ${whereSql}
     ORDER BY scheduled_date, scheduled_at NULLS LAST, country, title`,
    args
  );
  return r.rows;
}

export async function countCalendarEvents(pool) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM calendar.events`);
  return r.rows[0].n;
}

// ---------- Cron-job status (for /health page) ----------

export async function getCronStatus(pool) {
  const tasks = [];

  // News: last inserted article
  const news = await pool.query(`
    SELECT max(inserted_at) AS last_at,
           count(*) FILTER (WHERE inserted_at > now() - interval '1 hour')::int AS recent_n,
           count(*)::int AS total
    FROM news.articles
  `);
  tasks.push({
    name: 'news', schedule: '*/5 * * * *', expectedSec: 300,
    lastAt: news.rows[0].last_at, recent: news.rows[0].recent_n, total: news.rows[0].total,
  });

  // Sentiment: last sentiment.posts fetch
  const sent = await pool.query(`
    SELECT max(fetched_at) AS last_at,
           count(*) FILTER (WHERE fetched_at > now() - interval '1 hour')::int AS recent_n,
           count(*)::int AS total
    FROM sentiment.posts
  `);
  tasks.push({
    name: 'sentiment', schedule: '*/10 * * * *', expectedSec: 600,
    lastAt: sent.rows[0].last_at, recent: sent.rows[0].recent_n, total: sent.rows[0].total,
  });

  // Calendar: last calendar.events fetch
  const cal = await pool.query(`
    SELECT max(fetched_at) AS last_at,
           count(*) FILTER (WHERE fetched_at > now() - interval '2 hours')::int AS recent_n,
           count(*)::int AS total
    FROM calendar.events
  `);
  tasks.push({
    name: 'calendar', schedule: '0 * * * *', expectedSec: 3600,
    lastAt: cal.rows[0].last_at, recent: cal.rows[0].recent_n, total: cal.rows[0].total,
  });

  // IBKR backfill: most recent meta.quotes upsert (proxy for "did the
  // backfill bring fresh data and the worker propagate it?")
  const ibkr = await pool.query(`
    SELECT max(updated_at) AS last_at, count(*)::int AS total FROM meta.quotes
  `);
  tasks.push({
    name: 'ibkr', schedule: '*/30 * * * *', expectedSec: 1800,
    lastAt: ibkr.rows[0].last_at, recent: null, total: ibkr.rows[0].total,
  });

  // FRED: most recent macro.series.updated_at
  const fred = await pool.query(`
    SELECT max(updated_at) AS last_at,
           count(*) FILTER (WHERE updated_at > now() - interval '36 hours')::int AS recent_n,
           count(*)::int AS total
    FROM macro.series
  `);
  tasks.push({
    name: 'fred', schedule: '0 6 * * *', expectedSec: 86400,
    lastAt: fred.rows[0].last_at, recent: fred.rows[0].recent_n, total: fred.rows[0].total,
  });

  // Gateway-keepalive: implicit. We measure via meta.quotes freshness same
  // as IBKR — if the gateway dies, ibkr backfill stops, last_at goes stale.

  return tasks;
}
