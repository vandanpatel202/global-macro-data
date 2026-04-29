// Ticker extraction from social-media post text. v1 is intentionally narrow:
// only matches `$TICKER` (with the dollar sign) so we don't false-positive on
// every uppercase abbreviation. Bare tickers (without $) are common but very
// noisy without a stock universe to validate against.

// 1-5 char uppercase tokens that look like tickers but aren't (or aren't
// stocks worth tracking on this dashboard).
const BLACKLIST = new Set([
  // financial slang
  'DD', 'YOLO', 'FD', 'FDS', 'PT', 'OP',
  // currency codes
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'NZD', 'CHF', 'KRW', 'INR',
  // macro acronyms
  'GDP', 'CPI', 'PPI', 'FED', 'FOMC', 'ECB', 'BOE', 'BOJ', 'IPO', 'CEO', 'CFO',
  'CTO', 'COO', 'SEC', 'IRS', 'ETF', 'EPS', 'PE', 'EV',
  // crypto (we already track these as crypto, not stocks)
  'BTC', 'ETH', 'SOL', 'AVAX', 'ADA', 'DOT', 'LINK', 'XRP', 'DOGE', 'BNB',
  // generic abbreviations
  'AI', 'NFT', 'ATH', 'ATL', 'EOD', 'ROI', 'TLDR', 'TLDR',
  'EU', 'UK', 'US', 'UN', 'USA', 'WTF', 'OMG', 'FYI', 'IMO', 'TIL', 'ELI5',
  'BUY', 'SELL', 'HOLD', 'LONG', 'SHORT', 'BULL', 'BEAR',
  'CALL', 'PUT', 'CALLS', 'PUTS', 'OTM', 'ITM', 'ATM', 'IV', 'RSI', 'MACD',
  'API', 'APP', 'URL', 'CSV', 'PDF', 'SQL', 'XML', 'JSON', 'HTTP', 'HTTPS',
]);

const TICKER_REGEX = /\$([A-Z]{1,5})\b/g;

export function extractTickers(text) {
  if (!text) return [];
  const found = new Set();
  let m;
  TICKER_REGEX.lastIndex = 0;
  while ((m = TICKER_REGEX.exec(text)) !== null) {
    const t = m[1];
    if (!BLACKLIST.has(t)) found.add(t);
  }
  return [...found];
}

export function extractTickersFromPost(post) {
  const tickers = new Set();
  for (const t of extractTickers(post.title)) tickers.add(t);
  for (const t of extractTickers(post.body)) tickers.add(t);
  return [...tickers];
}
