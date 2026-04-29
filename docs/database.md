# Macro Dashboard — Database Schema

Postgres stores everything that lives longer than a single request: the symbol
universe, the latest quote per symbol (the cache), the historical OHLC bars per
symbol, the news feed archive, and the social-sentiment archive.

**Connection:** `DATABASE_URL` in `.env`. Currently
`postgresql://postgres:****@192.168.1.221:6661/postgres`.

**Provisioning:** `npm run db:init` (script: `scripts/db-init.js`). Idempotent —
re-runnable.

---

## Schemas at a glance

| Schema | Purpose | Tables |
|---|---|---|
| `meta` | Registry + live cache | `symbols`, `quotes` |
| `indices` | Equity indices | one table per symbol (`indices.gspc`, `indices.dji`, …) |
| `rates` | Yields | one table per symbol (`rates.us10y`, …) |
| `commodities` | Spot + futures | one table per spot symbol; one per monthly contract |
| `fx` | Currency pairs | one table per pair (`fx.eurusd`, …) |
| `crypto` | Crypto | one table per coin (`crypto.btc_usd`, …) |
| `news` | RSS articles | `articles` |
| `sentiment` | Reddit posts + ticker mentions | `posts`, `mentions` |

Per-instrument tables look like `<schema>.<table_name>`. The mapping from
canonical symbol (`^GSPC`, `CL=F`, etc.) to schema/table is stored in
`meta.symbols` so server.js doesn't need to hardcode it.

Identifier normalisation (Postgres can't have `^`, `=`, `.`, `-` or leading
digits): `^GSPC → gspc`, `CL=F → cl_f`, `BTC-USD → btc_usd`,
`FTSEMIB.MI → ftsemib_mi`, `000001.SS → t_000001_ss`. Logic lives in
`tableName()` in `lib/symbols.js`.

---

## `meta.symbols` — the registry

Single source of truth that every other piece of the system joins against.

```sql
CREATE TABLE meta.symbols (
  symbol         text PRIMARY KEY,         -- canonical: '^GSPC', 'CL=F', 'CLM26'
  name           text NOT NULL,            -- 'S&P 500', 'WTI Crude'
  section        text NOT NULL,            -- 'indices' | 'rates' | 'commodities' | 'fx' | 'crypto'
  group_name     text,                     -- 'North America', 'Energy', 'Majors', etc.
  region         text,                     -- 'US', 'EU', 'JP', 'Global', …
  schema_name    text NOT NULL,            -- which schema holds the per-symbol table
  table_name     text NOT NULL,            -- normalised table name
  yahoo          text,                     -- Yahoo provider symbol
  stooq          text,                     -- Stooq provider symbol
  fmp            text,                     -- FMP provider symbol
  awesome        text,                     -- AwesomeAPI pair (FX)
  coingecko      text,                     -- CoinGecko id (crypto)
  is_future      boolean NOT NULL DEFAULT false,
  futures_root   text,                     -- e.g. 'CL' for CLM26
  futures_month  int,                      -- 1..12
  futures_year   int,                      -- 2026
  tier           int NOT NULL DEFAULT 2,   -- 1 = headline (1min refresh), 2 = normal (10min)
  last_quote_at  timestamptz,              -- bumped by worker after each fetch attempt
  last_eod_at    timestamptz,              -- (reserved) last daily-close append
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX symbols_section_idx     ON meta.symbols(section);
CREATE INDEX symbols_root_idx        ON meta.symbols(futures_root);
CREATE INDEX symbols_tier_quote_idx  ON meta.symbols(tier, last_quote_at NULLS FIRST);
```

Populated by `scripts/db-init.js` from the `SECTIONS` and `FORWARDS` config in
`lib/symbols.js`. Re-runs only update the changed columns (`ON CONFLICT (symbol)
DO UPDATE …`).

---

## `meta.quotes` — the live cache

One row per symbol with the most recent snapshot. Replaces the old in-memory
`Map` cache. `lib/worker.js` upserts into this table; the API endpoints read
from it.

```sql
CREATE TABLE meta.quotes (
  symbol        text PRIMARY KEY REFERENCES meta.symbols(symbol) ON DELETE CASCADE,
  price         numeric,
  prev_close    numeric,
  change        numeric,
  pct           numeric,
  currency      text,
  market_state  text,
  spark         jsonb,                     -- intraday spark array (Yahoo only)
  source        text,                      -- 'yahoo' | 'stooq' | 'fmp'
  ts            timestamptz,               -- exchange-reported timestamp
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Per-instrument historical-OHLC tables

One table per symbol, in the section's schema. Column shape is asset-class
specific.

### Indices, commodities (spot + futures monthly), crypto

```sql
CREATE TABLE indices.gspc (
  date    date PRIMARY KEY,
  open    numeric,
  high    numeric,
  low     numeric,
  close   numeric,
  volume  bigint,
  source  text                             -- 'ibkr' | 'yahoo' | 'fmp' | 'stooq'
);
```

Same shape for everything in `indices.*`, `commodities.*` (spot), and
`crypto.*`.

### FX (no volume)

```sql
CREATE TABLE fx.eurusd (
  date    date PRIMARY KEY,
  open    numeric,
  high    numeric,
  low     numeric,
  close   numeric,
  source  text
);
```

### Rates (yield-only)

```sql
CREATE TABLE rates.us10y (
  date    date PRIMARY KEY,
  yield   numeric,
  source  text
);
```

### Commodity futures monthly contracts

Same column shape as commodities spot but with extra `open_interest`. Live
under `commodities.<contract>` — e.g. `commodities.clm26`.

```sql
CREATE TABLE commodities.clm26 (
  date           date PRIMARY KEY,
  open           numeric,
  high           numeric,
  low            numeric,
  close          numeric,
  volume         bigint,
  open_interest  bigint,
  source         text
);
```

### Idempotency

All inserts use `ON CONFLICT (date) DO NOTHING`, so re-running the backfill is
safe — only new dates are added.

---

## `news.articles`

```sql
CREATE TABLE news.articles (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL,             -- 'Reuters Business', 'CNBC World', …
  title         text NOT NULL,
  link          text NOT NULL UNIQUE,      -- dedup key
  published_at  timestamptz,
  snippet       text,
  inserted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX articles_pub_idx ON news.articles(published_at DESC NULLS LAST);
```

Worker polls 10 RSS feeds every 5 minutes (`lib/worker.js`, `RSS_FEEDS` in
`lib/symbols.js`) and inserts new items. `ON CONFLICT (link) DO NOTHING` dedupes
across runs.

---

## `sentiment.posts` and `sentiment.mentions`

Reddit posts pulled every 10 min from the subs in `SENTIMENT_SUBREDDITS` env
(default `wallstreetbets,stocks,options`) — see `lib/worker.js`. `$TICKER`
patterns are extracted with a small blacklist (`lib/sentiment.js`) and stored
as one mention row per (post, ticker) pair.

```sql
CREATE TABLE sentiment.posts (
  id            text PRIMARY KEY,          -- reddit fullname (t3_xxxxxx)
  source        text NOT NULL,             -- 'reddit:wallstreetbets', 'reddit:stocks', …
  title         text NOT NULL,
  body          text,
  url           text,
  author        text,
  score         int,
  num_comments  int,
  created_at    timestamptz NOT NULL,      -- post creation time on reddit
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_source_created_idx ON sentiment.posts(source, created_at DESC);

CREATE TABLE sentiment.mentions (
  id          bigserial PRIMARY KEY,
  post_id     text NOT NULL REFERENCES sentiment.posts(id) ON DELETE CASCADE,
  ticker      text NOT NULL,               -- 'NVDA', 'TSLA', etc. (the $ stripped)
  source      text NOT NULL,               -- denormalised from posts.source
  created_at  timestamptz NOT NULL,        -- denormalised from posts.created_at
  UNIQUE (post_id, ticker)
);
CREATE INDEX mentions_ticker_created_idx ON sentiment.mentions(ticker, created_at DESC);
CREATE INDEX mentions_created_idx        ON sentiment.mentions(created_at DESC);
```

`/api/sentiment/trending?window=24h` aggregates `mentions` by ticker over a
sliding window.

---

## Where the data comes from

| Layer | Source(s) | Cadence |
|---|---|---|
| `meta.quotes` (intraday snapshot + spark) | Yahoo → Stooq → FMP fallback chain (`lib/providers.js`) | tier-1 every 60s, tier-2 every 600s — `lib/worker.js` |
| `<schema>.<table>` (historical OHLC) | IBKR via TWS API (`scripts/ibkr_backfill.py`); FMP for the few symbols Yahoo/IBKR couldn't serve (`scripts/db-backfill.js`) | one-shot backfill + manual reruns; daily-append job is a TODO |
| `news.articles` | 10 RSS feeds | every 5 min |
| `sentiment.*` | reddit `.json` API (3 subreddits) | every 10 min |

---

## Provisioning + reset

```bash
# Create / migrate schemas + tables (idempotent)
npm run db:init

# Drop everything
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS meta, news, sentiment, indices, rates, commodities, fx, crypto CASCADE"
npm run db:init                         # rebuild

# Bulk historical backfill
.venv/bin/python scripts/ibkr_backfill.py --duration '5 Y'        # spot from IBKR
.venv/bin/python scripts/ibkr_backfill.py --futures --duration '5 Y'   # monthly contracts
npm run db:backfill -- --skip-filled    # FMP fallback for what IBKR couldn't serve
```

## Useful queries

```sql
-- How many bars per spot symbol?
SELECT s.section, s.symbol, s.schema_name||'.'||s.table_name AS tbl,
       (SELECT count(*) FROM (SELECT 1 FROM information_schema.tables
        WHERE table_schema=s.schema_name AND table_name=s.table_name) t) AS exists_check
FROM meta.symbols s WHERE s.is_future = false ORDER BY s.section, s.symbol;

-- Stalest cached quotes (worker fell behind?)
SELECT symbol, tier, last_quote_at, now() - last_quote_at AS staleness
FROM meta.symbols ORDER BY last_quote_at NULLS FIRST LIMIT 20;

-- Top trending tickers, last 24h
SELECT ticker, count(*) AS mentions, count(DISTINCT post_id) AS posts
FROM sentiment.mentions
WHERE created_at > now() - interval '24 hours'
GROUP BY ticker ORDER BY mentions DESC LIMIT 20;
```
