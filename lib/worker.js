// Background worker. Two loops:
//   - Quote loop: every QUOTE_TICK_MS, picks the next due-for-refresh symbol
//     and upserts its quote into meta.quotes. Tier-1 (headline) symbols
//     refresh every 60s, tier-2 every 600s.
//   - News loop: every NEWS_INTERVAL_MS, polls all RSS feeds and dedupes into
//     news.articles.
//
// Both loops run inside the API process. They start with startWorker(pool)
// from server.js. Disable by setting WORKER_DISABLED=1 in the env (useful for
// local debugging, or running multiple API replicas with one worker process).

import { fetchFeeds, fetchRedditNew, fetchCalendarEvents, fetchQuoteFallback } from './providers.js';
import {
  upsertQuote, markSymbolError, pickDueSymbol, insertArticles,
  insertPostsAndMentions, upsertCalendarEvents, loadQuoteFromHistory,
} from './store.js';
import { extractTickersFromPost } from './sentiment.js';
import { RSS_FEEDS } from './symbols.js';

// Quotes now come from the IBKR-backfilled historical OHLC tables — pure DB
// reads, no upstream rate limit. We can tick fast.
const QUOTE_TICK_MS = parseInt(process.env.QUOTE_TICK_MS || '150', 10);
const QUOTE_IDLE_MS = parseInt(process.env.QUOTE_IDLE_MS || '5000', 10);
const NEWS_INTERVAL_MS = parseInt(process.env.NEWS_INTERVAL_MS || '300000', 10); // 5 min
const SENTIMENT_INTERVAL_MS = parseInt(process.env.SENTIMENT_INTERVAL_MS || '600000', 10); // 10 min
const SENTIMENT_SUBREDDITS = (process.env.SENTIMENT_SUBREDDITS || 'wallstreetbets,stocks,options').split(',').map(s => s.trim()).filter(Boolean);
const CALENDAR_INTERVAL_MS = parseInt(process.env.CALENDAR_INTERVAL_MS || '3600000', 10); // 1 hour

let quoteRunning = false;
let quoteTimer = null;
let newsTimer = null;
let sentimentTimer = null;
let calendarTimer = null;
let metrics = { quotesOk: 0, quotesErr: 0, lastQuoteSym: null, lastQuoteAt: null,
                articlesInserted: 0, newsRunsOk: 0, newsRunsErr: 0, lastNewsAt: null,
                sentimentPosts: 0, sentimentMentions: 0, sentimentRunsOk: 0,
                sentimentRunsErr: 0, lastSentimentAt: null,
                calendarEvents: 0, calendarRunsOk: 0, calendarRunsErr: 0,
                lastCalendarAt: null };

async function quoteTick(pool) {
  if (quoteRunning) return; // re-entry guard
  quoteRunning = true;
  try {
    const due = await pickDueSymbol(pool);
    if (!due) {
      quoteTimer = setTimeout(() => quoteTick(pool), QUOTE_IDLE_MS);
      return;
    }
    try {
      // 1. IBKR (DB) — primary
      let q = await loadQuoteFromHistory(pool, due);
      // 2. Yahoo/Stooq fallback — only when IBKR has nothing for this symbol
      if (!q) {
        try {
          q = await fetchQuoteFallback(due);
        } catch (e) {
          // fall through; markSymbolError below
        }
      }
      if (q) {
        await upsertQuote(pool, due.symbol, q);
        metrics.quotesOk++;
      } else {
        await markSymbolError(pool, due.symbol);
        metrics.quotesErr++;
      }
    } catch (e) {
      await markSymbolError(pool, due.symbol);
      metrics.quotesErr++;
      console.warn(`[worker] quote ${due.symbol}: ${e.message}`);
    }
    metrics.lastQuoteSym = due.symbol;
    metrics.lastQuoteAt = Date.now();
  } catch (e) {
    console.error('[worker] quote tick failed:', e.message);
  } finally {
    quoteRunning = false;
    quoteTimer = setTimeout(() => quoteTick(pool), QUOTE_TICK_MS);
  }
}

export async function newsTick(pool) {
  try {
    const items = await fetchFeeds(RSS_FEEDS);
    const inserted = await insertArticles(pool, items);
    metrics.articlesInserted += inserted;
    metrics.newsRunsOk++;
    metrics.lastNewsAt = Date.now();
    if (inserted) console.log(`[worker] news: +${inserted} articles (${items.length} fetched)`);
  } catch (e) {
    metrics.newsRunsErr++;
    console.warn('[worker] news tick failed:', e.message);
  }
}

export async function sentimentTick(pool) {
  try {
    let totalPosts = [];
    const tickerMap = new Map(); // postId → string[]
    for (const sub of SENTIMENT_SUBREDDITS) {
      try {
        const posts = await fetchRedditNew(sub, 100);
        for (const p of posts) tickerMap.set(p.id, extractTickersFromPost(p));
        totalPosts = totalPosts.concat(posts);
        // Reddit anonymous endpoints throttle hard if hit too fast.
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.warn(`[worker] reddit r/${sub}: ${e.message}`);
      }
    }
    if (!totalPosts.length) {
      metrics.sentimentRunsErr++;
      return;
    }
    const { posts: postsIns, mentions: mentionsIns } =
      await insertPostsAndMentions(pool, totalPosts, tickerMap);
    metrics.sentimentPosts += postsIns;
    metrics.sentimentMentions += mentionsIns;
    metrics.sentimentRunsOk++;
    metrics.lastSentimentAt = Date.now();
    if (postsIns || mentionsIns) {
      console.log(`[worker] sentiment: +${postsIns} posts, +${mentionsIns} ticker mentions`);
    }
  } catch (e) {
    metrics.sentimentRunsErr++;
    console.warn('[worker] sentiment tick failed:', e.message);
  }
}

export async function calendarTick(pool) {
  try {
    const events = await fetchCalendarEvents();
    const inserted = await upsertCalendarEvents(pool, events);
    metrics.calendarEvents += inserted;
    metrics.calendarRunsOk++;
    metrics.lastCalendarAt = Date.now();
    console.log(`[worker] calendar: ${inserted} events upserted (${events.length} fetched)`);
  } catch (e) {
    metrics.calendarRunsErr++;
    console.warn('[worker] calendar tick failed:', e.message);
  }
}

export function startWorker(pool) {
  if (process.env.WORKER_DISABLED === '1') {
    console.log('[worker] disabled via WORKER_DISABLED=1');
    return;
  }
  // CRON_MODE=1 means external cron is handling news/sentiment/calendar — keep
  // only the in-process quote refresh (DB-only, low overhead).
  const cronMode = process.env.CRON_MODE === '1';
  console.log(
    cronMode
      ? `[worker] starting: quotes ${QUOTE_TICK_MS}ms (cron mode — news/sentiment/calendar handled externally)`
      : `[worker] starting: quotes ${QUOTE_TICK_MS}ms, news ${NEWS_INTERVAL_MS}ms, sentiment ${SENTIMENT_INTERVAL_MS}ms, calendar ${CALENDAR_INTERVAL_MS}ms`
  );
  quoteTimer = setTimeout(() => quoteTick(pool), 1000);
  if (!cronMode) {
    newsTimer = setInterval(() => newsTick(pool), NEWS_INTERVAL_MS);
    sentimentTimer = setInterval(() => sentimentTick(pool), SENTIMENT_INTERVAL_MS);
    calendarTimer = setInterval(() => calendarTick(pool), CALENDAR_INTERVAL_MS);
    // Run periodics once on boot so we don't wait the full interval.
    setTimeout(() => newsTick(pool), 2000);
    setTimeout(() => sentimentTick(pool), 4000);
    setTimeout(() => calendarTick(pool), 6000);
  }
}

export function stopWorker() {
  if (quoteTimer) clearTimeout(quoteTimer);
  if (newsTimer) clearInterval(newsTimer);
  if (sentimentTimer) clearInterval(sentimentTimer);
  if (calendarTimer) clearInterval(calendarTimer);
  quoteTimer = newsTimer = sentimentTimer = calendarTimer = null;
}

export function getMetrics() {
  return { ...metrics };
}
