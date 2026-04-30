import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import pg from 'pg';
import {
  SECTIONS, FORWARDS, HEADLINE_SYMBOLS, generateContracts, tableName,
} from './lib/symbols.js';
import {
  getSectionFromDb, getOverviewTilesFromDb, getNews, countQuotes, countArticles,
  getTrendingTickers, getPostsForTicker,
  countSentimentPosts, countSentimentMentions,
  getCalendarEvents, countCalendarEvents,
  getCronStatus,
} from './lib/store.js';
import { startWorker, getMetrics } from './lib/worker.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL, max: 10, connectionTimeoutMillis: 8000 });

const distDir = path.join(__dirname, 'dist');
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, 'public');
app.use(express.static(staticDir));

app.get('/api/sections', (_req, res) => {
  res.json(Object.entries(SECTIONS).map(([key, s]) => ({ key, label: s.label })));
});

// Serve from meta.quotes (worker keeps it warm). Group labels still come from
// SECTIONS so the response shape includes the group ordering the UI expects.
app.get('/api/markets/:section', async (req, res) => {
  const section = req.params.section;
  if (!SECTIONS[section]) return res.status(404).json({ error: 'unknown section' });
  try {
    const data = await getSectionFromDb(pool, section);
    // Preserve the SECTIONS group order in the response.
    const ordered = { key: section, label: SECTIONS[section].label, groups: {}, updatedAt: data.updatedAt };
    for (const groupName of Object.keys(SECTIONS[section].groups)) {
      ordered.groups[groupName] = data.groups[groupName] || [];
    }
    res.json(ordered);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/overview', async (_req, res) => {
  try {
    res.json(await getOverviewTilesFromDb(pool, HEADLINE_SYMBOLS));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/futures', (_req, res) => {
  res.json(Object.entries(FORWARDS).map(([root, cfg]) => ({ root, label: cfg.label, unit: cfg.unit })));
});

// Forward curves read the latest close from each contract's historical OHLC
// table (commodities.<contract>) — populated by the IBKR backfill. Live tick
// data isn't needed for a curve view; the close price is what matters.
app.get('/api/futures/:root', async (req, res) => {
  const rootKey = (req.params.root || '').toUpperCase();
  const cfg = FORWARDS[rootKey];
  if (!cfg) return res.status(404).json({ error: 'unknown root', supported: Object.keys(FORWARDS) });
  try {
    const contracts = generateContracts(rootKey, cfg.suffix, cfg.months);
    const points = [];
    let updatedAt = Date.now();
    for (const c of contracts) {
      const t = tableName(c.contract);
      try {
        const r = await pool.query(
          `SELECT date, close,
                  (SELECT close FROM commodities.${t}
                   WHERE date < (SELECT max(date) FROM commodities.${t})
                   ORDER BY date DESC LIMIT 1) AS prev_close
           FROM commodities.${t} ORDER BY date DESC LIMIT 1`
        );
        if (r.rowCount && r.rows[0].close != null) {
          points.push({
            contract: c.contract, label: c.label, expiry: c.expiry, year: c.year, month: c.month,
            price: Number(r.rows[0].close),
            prevClose: r.rows[0].prev_close != null ? Number(r.rows[0].prev_close) : null,
          });
        }
      } catch (_) { /* table missing or empty — skip */ }
    }
    let shape = 'mixed';
    if (points.length >= 2) {
      const first = points[0].price;
      const last = points[points.length - 1].price;
      if (last > first * 1.005) shape = 'contango';
      else if (last < first * 0.995) shape = 'backwardation';
      else shape = 'flat';
    }
    res.json({ root: rootKey, label: cfg.label, unit: cfg.unit, shape, points, updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Historical OHLC for a single symbol. Reads from <schema>.<table_name>.
// range options: 1m, 6m, 1y, 5y, 10y, max.
app.get('/api/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const range = (req.query.range || '1y').toString();
  const rangeDays = {
    '1w': 7, '1m': 30, '3m': 92, '6m': 183, '1y': 365, '5y': 1830, '10y': 3650, 'max': null,
  }[range];
  if (rangeDays === undefined) return res.status(400).json({ error: 'bad range' });
  try {
    const meta = await pool.query(
      `SELECT schema_name, table_name, section FROM meta.symbols WHERE symbol = $1`,
      [symbol]
    );
    if (!meta.rowCount) return res.status(404).json({ error: 'unknown symbol' });
    const { schema_name, table_name, section } = meta.rows[0];
    const cols = section === 'rates'
      ? 'date, yield AS close'
      : 'date, open, high, low, close, volume';
    const where = rangeDays ? `WHERE date >= current_date - interval '${rangeDays} days'` : '';
    const r = await pool.query(`SELECT ${cols} FROM ${schema_name}.${table_name} ${where} ORDER BY date ASC`);
    res.json({ symbol, range, points: r.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/news', async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : null;
  const sources = req.query.source
    ? String(req.query.source).split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const limit = Math.min(parseInt(req.query.limit || '120', 10) || 120, 500);
  try {
    const items = await getNews(pool, { q: q || null, sources, limit });
    res.json({ items, q: q || null, sources: sources || null, updatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- Macro / FRED ----------
// ---------- US Treasury yield curve at one or more dates ----------
// Each maturity tries the IBKR-backed rates.<table> first (4 of these have
// IBKR data: 3M, 5Y, 10Y, 30Y), then falls back to FRED's macro.dgs* table.
const YC_MATURITIES = [
  { sym: 'US3M',  years: 0.25, label: '3M',  rates: 'us3m',  fred: 'dgs3mo' },
  { sym: 'US6M',  years: 0.5,  label: '6M',  rates: 'us6m',  fred: 'dgs6mo' },
  { sym: 'US1Y',  years: 1,    label: '1Y',  rates: 'us1y',  fred: 'dgs1' },
  { sym: 'US2Y',  years: 2,    label: '2Y',  rates: 'us2y',  fred: 'dgs2' },
  { sym: 'US3Y',  years: 3,    label: '3Y',  rates: 'us3y',  fred: 'dgs3' },
  { sym: 'US5Y',  years: 5,    label: '5Y',  rates: 'us5y',  fred: 'dgs5' },
  { sym: 'US7Y',  years: 7,    label: '7Y',  rates: 'us7y',  fred: 'dgs7' },
  { sym: 'US10Y', years: 10,   label: '10Y', rates: 'us10y', fred: 'dgs10' },
  { sym: 'US20Y', years: 20,   label: '20Y', rates: 'us20y', fred: 'dgs20' },
  { sym: 'US30Y', years: 30,   label: '30Y', rates: 'us30y', fred: 'dgs30' },
];

async function lookupYieldOnOrBefore(table, schema, valueCol, date) {
  try {
    const r = await pool.query(
      `SELECT date, ${valueCol} AS y FROM ${schema}.${table}
       WHERE date <= $1 AND ${valueCol} IS NOT NULL
       ORDER BY date DESC LIMIT 1`,
      [date]
    );
    if (r.rowCount && r.rows[0].y != null) {
      return {
        yield: Number(r.rows[0].y),
        actualDate: r.rows[0].date.toISOString().slice(0, 10),
      };
    }
  } catch (_) { /* table missing or empty */ }
  return null;
}

app.get('/api/yield-curve', async (req, res) => {
  const dates = String(req.query.dates || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!dates.length) return res.status(400).json({ error: 'dates required (comma-separated YYYY-MM-DD)' });
  try {
    const curves = [];
    for (const date of dates) {
      const points = [];
      for (const m of YC_MATURITIES) {
        // 1. IBKR-backed rates table (yield col)
        let hit = await lookupYieldOnOrBefore(m.rates, 'rates', 'yield', date);
        let source = 'ibkr';
        // 2. FRED fallback
        if (!hit) {
          hit = await lookupYieldOnOrBefore(m.fred, 'macro', 'value', date);
          source = 'fred';
        }
        if (hit) {
          points.push({
            symbol: m.sym, label: m.label, years: m.years,
            yield: hit.yield, actualDate: hit.actualDate, source,
          });
        }
      }
      curves.push({ date, points });
    }
    res.json({ curves });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/macro/series', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, group_name AS "group", units, frequency, last_obs
       FROM macro.series ORDER BY group_name, id`
    );
    const groups = {};
    for (const row of r.rows) {
      if (!groups[row.group]) groups[row.group] = [];
      groups[row.group].push(row);
    }
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/macro/series/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  const range = (req.query.range || '5y').toString();
  const rangeDays = {
    '1y': 365, '5y': 1830, '10y': 3650, '20y': 7300, 'max': null,
  }[range];
  if (rangeDays === undefined) return res.status(400).json({ error: 'bad range' });
  try {
    const meta = await pool.query(
      `SELECT id, name, group_name AS "group", units, frequency, table_name
       FROM macro.series WHERE id = $1`, [id]
    );
    if (!meta.rowCount) return res.status(404).json({ error: 'unknown series' });
    const m = meta.rows[0];
    const where = rangeDays ? `WHERE date >= current_date - interval '${rangeDays} days'` : '';
    const r = await pool.query(
      `SELECT date, value FROM macro.${m.table_name} ${where} ORDER BY date ASC`
    );
    res.json({ id: m.id, name: m.name, group: m.group, units: m.units,
               frequency: m.frequency, range, points: r.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- Economic calendar ----------
app.get('/api/calendar', async (req, res) => {
  const fromDate = req.query.from ? String(req.query.from) : null;
  const toDate = req.query.to ? String(req.query.to) : null;
  const country = req.query.country ? String(req.query.country).toUpperCase() : null;
  const impact = req.query.impact ? String(req.query.impact) : null;
  try {
    const events = await getCalendarEvents(pool, { fromDate, toDate, country, impact });
    res.json({ events, updatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/sentiment/trending', async (req, res) => {
  const win = (req.query.window || '24h').toString();
  const hours = win === '7d' ? 168 : win === '12h' ? 12 : win === '6h' ? 6 : 24;
  const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 100);
  try {
    const items = await getTrendingTickers(pool, hours, limit);
    res.json({ window: win, items, updatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/sentiment/ticker/:ticker', async (req, res) => {
  const t = (req.params.ticker || '').toUpperCase();
  const win = (req.query.window || '24h').toString();
  const hours = win === '7d' ? 168 : 24;
  try {
    const posts = await getPostsForTicker(pool, t, hours, 30);
    res.json({ ticker: t, window: win, posts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- Cron / task monitoring ----------
const LOG_DIR = process.env.MACRO_LOG_DIR || '/tmp/macrodash';
const LOG_FILES = {
  news: 'news.log', sentiment: 'sentiment.log', calendar: 'calendar.log',
  ibkr: 'ibkr.log', fred: 'fred.log', gateway: 'gateway-keepalive.log',
};

function tailFile(filePath, lines = 20) {
  try {
    if (!fs.existsSync(filePath)) return { exists: false, mtime: null, tail: [] };
    const stat = fs.statSync(filePath);
    const buf = fs.readFileSync(filePath, 'utf-8');
    const all = buf.split('\n').filter(Boolean);
    return { exists: true, mtime: stat.mtime, tail: all.slice(-lines) };
  } catch (e) {
    return { exists: false, mtime: null, tail: [`[read error] ${e.message}`] };
  }
}

app.get('/api/cron/status', async (_req, res) => {
  try {
    const tasks = await getCronStatus(pool);
    // Attach log info
    for (const t of tasks) {
      const logName = LOG_FILES[t.name];
      if (logName) {
        const logInfo = tailFile(path.join(LOG_DIR, logName), 10);
        t.logExists = logInfo.exists;
        t.logMtime = logInfo.mtime;
        t.logTail = logInfo.tail;
      }
    }
    // Add gateway-keepalive task (no DB metric — uses log only)
    const gw = tailFile(path.join(LOG_DIR, LOG_FILES.gateway), 10);
    tasks.push({
      name: 'gateway', schedule: '* * * * *', expectedSec: 60,
      lastAt: gw.mtime, recent: null, total: null,
      logExists: gw.exists, logMtime: gw.mtime, logTail: gw.tail,
    });
    res.json({ tasks, logDir: LOG_DIR, generatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const [quotes, articles, sPosts, sMentions] = await Promise.all([
      countQuotes(pool), countArticles(pool),
      countSentimentPosts(pool), countSentimentMentions(pool),
    ]);
    res.json({
      ok: true, quotes, articles,
      sentiment: { posts: sPosts, mentions: sMentions },
      worker: getMetrics(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// SPA fallback: any non-API request that didn't match a static file serves index.html
// so React Router can handle deep links.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexFile = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Macro dashboard on http://localhost:${PORT} (serving ${path.basename(staticDir)}/)`);
  startWorker(pool);
});
