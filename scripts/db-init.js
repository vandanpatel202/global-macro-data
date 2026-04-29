// Provision Postgres schemas + per-instrument tables for the macro dashboard.
//
// Layout:
//   indices.<symbol>      — date, open, high, low, close, volume, source
//   rates.<symbol>        — date, yield, source                 (yields, not OHLC)
//   commodities.<symbol>  — date, open, high, low, close, volume, source
//   commodities.<contract>— date, open, high, low, close, volume, open_interest, source
//                           (futures monthly contracts live alongside spot)
//   fx.<symbol>           — date, open, high, low, close, source (no volume)
//   crypto.<symbol>       — date, open, high, low, close, volume, source
//   meta.symbols          — registry: canonical symbol → schema/table + provider IDs

import pg from 'pg';
import { SECTIONS, FORWARDS, HEADLINE_SYMBOLS, tableName, generateContracts } from '../lib/symbols.js';
import { FRED_SERIES, fredTableName } from '../lib/fred.js';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:ThIMK0EMlu3LpiwnWtch@192.168.1.221:6661/postgres';

const COLUMNS_BY_SECTION = {
  indices:     'date date PRIMARY KEY, open numeric, high numeric, low numeric, close numeric, volume bigint, source text',
  rates:       'date date PRIMARY KEY, yield numeric, source text',
  commodities: 'date date PRIMARY KEY, open numeric, high numeric, low numeric, close numeric, volume bigint, source text',
  fx:          'date date PRIMARY KEY, open numeric, high numeric, low numeric, close numeric, source text',
  crypto:      'date date PRIMARY KEY, open numeric, high numeric, low numeric, close numeric, volume bigint, source text',
};

const FUTURES_COLUMNS = 'date date PRIMARY KEY, open numeric, high numeric, low numeric, close numeric, volume bigint, open_interest bigint, source text';

async function main() {
  const c = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 8000 });
  await c.connect();
  console.log('connected to', DATABASE_URL.replace(/:[^:@/]+@/, ':****@'));

  // 1. Schemas
  for (const s of [...Object.keys(SECTIONS), 'meta', 'news', 'sentiment', 'macro', 'calendar']) {
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
  }

  // 2. Registry
  await c.query(`
    CREATE TABLE IF NOT EXISTS meta.symbols (
      symbol         text PRIMARY KEY,
      name           text NOT NULL,
      section        text NOT NULL,
      group_name     text,
      region         text,
      schema_name    text NOT NULL,
      table_name     text NOT NULL,
      yahoo          text,
      stooq          text,
      fmp            text,
      awesome        text,
      coingecko      text,
      is_future      boolean NOT NULL DEFAULT false,
      futures_root   text,
      futures_month  int,
      futures_year   int,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS symbols_section_idx ON meta.symbols(section)`);
  await c.query(`CREATE INDEX IF NOT EXISTS symbols_root_idx    ON meta.symbols(futures_root)`);

  // Worker-scheduling columns. tier 1 = headline (1min), tier 2 = normal (10min).
  await c.query(`ALTER TABLE meta.symbols
                   ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 2,
                   ADD COLUMN IF NOT EXISTS last_quote_at timestamptz,
                   ADD COLUMN IF NOT EXISTS last_eod_at   timestamptz`);
  await c.query(`CREATE INDEX IF NOT EXISTS symbols_tier_quote_idx
                 ON meta.symbols(tier, last_quote_at NULLS FIRST)`);

  // Latest-snapshot quote per symbol — replaces the in-memory cache.
  await c.query(`
    CREATE TABLE IF NOT EXISTS meta.quotes (
      symbol        text PRIMARY KEY REFERENCES meta.symbols(symbol) ON DELETE CASCADE,
      price         numeric,
      prev_close    numeric,
      change        numeric,
      pct           numeric,
      currency      text,
      market_state  text,
      spark         jsonb,
      source        text,
      ts            timestamptz,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  // News articles, deduped by link.
  await c.query(`
    CREATE TABLE IF NOT EXISTS news.articles (
      id            bigserial PRIMARY KEY,
      source        text NOT NULL,
      title         text NOT NULL,
      link          text NOT NULL UNIQUE,
      published_at  timestamptz,
      snippet       text,
      inserted_at   timestamptz NOT NULL DEFAULT now()
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS articles_pub_idx
                 ON news.articles(published_at DESC NULLS LAST)`);

  // Full-text search column. Generated, so it stays in sync automatically.
  // Title is weighted A (highest), snippet B — ts_rank gives title hits more weight.
  await c.query(`
    ALTER TABLE news.articles
      ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(snippet, '')), 'B')
      ) STORED
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS articles_search_idx
                 ON news.articles USING GIN (search_tsv)`);

  // Sentiment: posts pulled from social sources, with extracted ticker mentions.
  await c.query(`
    CREATE TABLE IF NOT EXISTS sentiment.posts (
      id            text PRIMARY KEY,
      source        text NOT NULL,
      title         text NOT NULL,
      body          text,
      url           text,
      author        text,
      score         int,
      num_comments  int,
      created_at    timestamptz NOT NULL,
      fetched_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS posts_source_created_idx
                 ON sentiment.posts(source, created_at DESC)`);
  await c.query(`
    CREATE TABLE IF NOT EXISTS sentiment.mentions (
      id           bigserial PRIMARY KEY,
      post_id      text NOT NULL REFERENCES sentiment.posts(id) ON DELETE CASCADE,
      ticker       text NOT NULL,
      source       text NOT NULL,
      created_at   timestamptz NOT NULL,
      UNIQUE (post_id, ticker)
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS mentions_ticker_created_idx
                 ON sentiment.mentions(ticker, created_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS mentions_created_idx
                 ON sentiment.mentions(created_at DESC)`);

  // Macro: FRED series registry + per-series tables.
  await c.query(`
    CREATE TABLE IF NOT EXISTS macro.series (
      id          text PRIMARY KEY,
      name        text NOT NULL,
      group_name  text,
      units       text,
      frequency   text,
      schema_name text NOT NULL DEFAULT 'macro',
      table_name  text NOT NULL,
      last_obs    date,
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  let macroCount = 0;
  for (const [seriesId, cfg] of Object.entries(FRED_SERIES)) {
    const t = fredTableName(seriesId);
    await c.query(`
      CREATE TABLE IF NOT EXISTS macro.${t} (
        date    date PRIMARY KEY,
        value   numeric,
        source  text NOT NULL DEFAULT 'fred'
      )
    `);
    await c.query(
      `INSERT INTO macro.series (id, name, group_name, units, frequency, table_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, group_name = EXCLUDED.group_name,
         units = EXCLUDED.units, frequency = EXCLUDED.frequency,
         table_name = EXCLUDED.table_name, updated_at = now()`,
      [seriesId, cfg.name, cfg.group, cfg.units, cfg.freq, t]
    );
    macroCount++;
  }
  await c.query(`CREATE INDEX IF NOT EXISTS series_group_idx ON macro.series(group_name)`);
  console.log(`macro series tables: ${macroCount}`);

  // Economic calendar — events keyed by (country, date, title). Forex Factory's
  // weekly XML is the upstream feed; the worker refreshes hourly.
  await c.query(`
    CREATE TABLE IF NOT EXISTS calendar.events (
      id              bigserial PRIMARY KEY,
      title           text NOT NULL,
      country         text NOT NULL,
      scheduled_at    timestamptz,
      scheduled_date  date NOT NULL,
      time_label      text,
      impact          text,
      forecast        text,
      previous        text,
      url             text,
      fetched_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (country, scheduled_date, title)
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS events_scheduled_idx
                 ON calendar.events(scheduled_at NULLS LAST)`);
  await c.query(`CREATE INDEX IF NOT EXISTS events_date_idx
                 ON calendar.events(scheduled_date)`);

  // 3. Spot tables + registry rows
  let spot = 0;
  for (const [section, sec] of Object.entries(SECTIONS)) {
    const cols = COLUMNS_BY_SECTION[section];
    if (!cols) throw new Error(`no column template for section ${section}`);
    for (const [groupName, items] of Object.entries(sec.groups)) {
      for (const item of items) {
        const t = tableName(item.symbol);
        await c.query(`CREATE TABLE IF NOT EXISTS ${section}.${t} (${cols})`);
        await c.query(
          `INSERT INTO meta.symbols
             (symbol, name, section, group_name, region, schema_name, table_name,
              yahoo, stooq, fmp, awesome, coingecko)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name, group_name = EXCLUDED.group_name, region = EXCLUDED.region,
             schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name,
             yahoo = EXCLUDED.yahoo, stooq = EXCLUDED.stooq, fmp = EXCLUDED.fmp,
             awesome = EXCLUDED.awesome, coingecko = EXCLUDED.coingecko,
             updated_at = now()`,
          [item.symbol, item.name, section, groupName, item.region || null, section, t,
           item.y || null, item.s || null, item.f || null, item.a || null, item.cg || null]
        );
        spot++;
      }
    }
  }
  console.log(`spot tables: ${spot}`);

  // 4. Futures monthly contracts (live in commodities schema)
  let fut = 0;
  for (const [root, cfg] of Object.entries(FORWARDS)) {
    const contracts = generateContracts(root, cfg.suffix, cfg.months);
    for (const ct of contracts) {
      const t = tableName(ct.contract);
      await c.query(`CREATE TABLE IF NOT EXISTS commodities.${t} (${FUTURES_COLUMNS})`);
      await c.query(
        `INSERT INTO meta.symbols
           (symbol, name, section, group_name, region, schema_name, table_name,
            yahoo, is_future, futures_root, futures_month, futures_year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (symbol) DO UPDATE SET
           name = EXCLUDED.name, group_name = EXCLUDED.group_name,
           schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name,
           yahoo = EXCLUDED.yahoo, is_future = EXCLUDED.is_future,
           futures_root = EXCLUDED.futures_root, futures_month = EXCLUDED.futures_month,
           futures_year = EXCLUDED.futures_year, updated_at = now()`,
        [ct.contract, `${cfg.label} ${ct.label}`, 'commodities', `Futures: ${cfg.label}`,
         'Global', 'commodities', t, ct.symbol, true, root, ct.month, ct.year]
      );
      fut++;
    }
  }
  console.log(`futures contract tables: ${fut}`);

  // Mark headline symbols as tier 1 (faster refresh in the worker).
  const tieredRes = await c.query(
    `UPDATE meta.symbols SET tier = 1 WHERE symbol = ANY($1)`,
    [HEADLINE_SYMBOLS]
  );
  console.log(`headline symbols marked tier 1: ${tieredRes.rowCount}`);

  // 5. Summary
  const summary = await c.query(`
    SELECT schema_name, COUNT(*)::int AS n
    FROM meta.symbols GROUP BY schema_name ORDER BY schema_name
  `);
  for (const r of summary.rows) console.log(`  ${r.schema_name}: ${r.n} symbols`);

  await c.end();
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
