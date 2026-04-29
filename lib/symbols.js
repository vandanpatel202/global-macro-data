// Single source of truth for the instrument universe.
// Imported by server.js (live API) and scripts/db-init.js (table provisioning).

export const SECTIONS = {
  indices: {
    label: 'Global Equity Indices',
    groups: {
      'North America': [
        { symbol: '^GSPC',   name: 'S&P 500',            region: 'US', y: '^GSPC',   s: '^spx', f: '^GSPC' },
        { symbol: '^DJI',    name: 'Dow Jones 30',       region: 'US', y: '^DJI',    s: '^dji', f: '^DJI' },
        { symbol: '^NDX',    name: 'Nasdaq 100',         region: 'US', y: '^NDX',    s: '^ndx', f: '^NDX' },
        { symbol: '^IXIC',   name: 'Nasdaq Composite',   region: 'US', y: '^IXIC',   f: '^IXIC' },
        { symbol: '^RUT',    name: 'Russell 2000',       region: 'US', y: '^RUT',    f: '^RUT' },
        { symbol: '^VIX',    name: 'VIX (Equity Vol)',   region: 'US', y: '^VIX',    f: '^VIX' },
        { symbol: '^GSPTSE', name: 'TSX Composite',      region: 'CA', y: '^GSPTSE', s: '^tsx', f: '^GSPTSE' },
      ],
      'Europe': [
        { symbol: '^FTSE',     name: 'FTSE 100',         region: 'UK', y: '^FTSE',   s: '^ftm', f: '^FTSE' },
        { symbol: '^FTMC',     name: 'FTSE 250',         region: 'UK', y: '^FTMC',   f: '^FTMC' },
        { symbol: '^GDAXI',    name: 'DAX 40',           region: 'DE', y: '^GDAXI',  s: '^dax', f: '^GDAXI' },
        { symbol: '^MDAXI',    name: 'MDAX',             region: 'DE', y: '^MDAXI',  f: '^MDAXI' },
        { symbol: '^FCHI',     name: 'CAC 40',           region: 'FR', y: '^FCHI',   s: '^cac', f: '^FCHI' },
        { symbol: '^STOXX50E', name: 'Euro Stoxx 50',    region: 'EU', y: '^STOXX50E', f: '^STOXX50E' },
        { symbol: '^STOXX',    name: 'Stoxx Europe 600', region: 'EU', y: '^STOXX',    f: '^STOXX' },
        { symbol: 'FTSEMIB.MI', name: 'FTSE MIB',        region: 'IT', y: 'FTSEMIB.MI', f: 'FTSEMIB.MI' },
        { symbol: '^IBEX',     name: 'IBEX 35',          region: 'ES', y: '^IBEX',   s: '^ibex', f: '^IBEX' },
        { symbol: '^AEX',      name: 'AEX',              region: 'NL', y: '^AEX',    s: '^aex', f: '^AEX' },
        { symbol: '^SSMI',     name: 'SMI',              region: 'CH', y: '^SSMI',   s: '^smi', f: '^SSMI' },
        { symbol: '^OMX',      name: 'OMX Stockholm 30', region: 'SE', y: '^OMX',    f: '^OMXS30' },
      ],
      'Asia Pacific': [
        { symbol: '^N225',     name: 'Nikkei 225',           region: 'JP', y: '^N225', s: '^nkx', f: '^N225' },
        { symbol: '^TOPX',     name: 'TOPIX',                region: 'JP', y: '^TOPX', s: '^tpx' },
        { symbol: '^HSI',      name: 'Hang Seng',            region: 'HK', y: '^HSI',  s: '^hsi', f: '^HSI' },
        { symbol: '^HSCE',     name: 'HS China Enterprises', region: 'HK', y: '^HSCE', f: '^HSCE' },
        { symbol: '000001.SS', name: 'Shanghai Composite',   region: 'CN', y: '000001.SS', s: '^shc', f: '000001.SS' },
        { symbol: '399001.SZ', name: 'Shenzhen Component',   region: 'CN', y: '399001.SZ', f: '399001.SZ' },
        { symbol: '^STI',      name: 'Straits Times',        region: 'SG', y: '^STI',  s: '^sti', f: '^STI' },
        { symbol: '^KS11',     name: 'KOSPI',                region: 'KR', y: '^KS11', s: '^kospi', f: '^KS11' },
        { symbol: '^TWII',     name: 'TAIEX',                region: 'TW', y: '^TWII', f: '^TWII' },
        { symbol: '^AXJO',     name: 'ASX 200',              region: 'AU', y: '^AXJO', f: '^AXJO' },
        { symbol: '^NZ50',     name: 'NZX 50',               region: 'NZ', y: '^NZ50', s: '^nz50', f: '^NZ50' },
      ],
      'Emerging & Other': [
        { symbol: '^BSESN', name: 'Sensex',           region: 'IN', y: '^BSESN', s: '^snx', f: '^BSESN' },
        { symbol: '^NSEI',  name: 'Nifty 50',         region: 'IN', y: '^NSEI',  f: '^NSEI' },
        { symbol: '^BVSP',  name: 'Bovespa',          region: 'BR', y: '^BVSP',  f: '^BVSP' },
        { symbol: '^MXX',   name: 'IPC Mexico',       region: 'MX', y: '^MXX',   f: '^MXX' },
        { symbol: '^JKSE',  name: 'Jakarta Composite', region: 'ID', y: '^JKSE', f: '^JKSE' },
        { symbol: '^KLSE',  name: 'KLCI',             region: 'MY', y: '^KLSE',  f: '^KLSE' },
        { symbol: '^SET',   name: 'SET Index',        region: 'TH', s: '^set' },
      ],
    },
  },

  rates: {
    label: 'Interest Rates & Yields',
    groups: {
      'US Treasury Curve': [
        { symbol: 'US3M',  name: 'US 3M Yield',  region: 'US', y: '^IRX', s: '3musy.b', f: '^IRX' },
        { symbol: 'US6M',  name: 'US 6M Yield',  region: 'US', s: '6musy.b' },
        { symbol: 'US1Y',  name: 'US 1Y Yield',  region: 'US', s: '1yusy.b' },
        { symbol: 'US2Y',  name: 'US 2Y Yield',  region: 'US', s: '2yusy.b' },
        { symbol: 'US3Y',  name: 'US 3Y Yield',  region: 'US', s: '3yusy.b' },
        { symbol: 'US5Y',  name: 'US 5Y Yield',  region: 'US', y: '^FVX', s: '5yusy.b', f: '^FVX' },
        { symbol: 'US7Y',  name: 'US 7Y Yield',  region: 'US', s: '7yusy.b' },
        { symbol: 'US10Y', name: 'US 10Y Yield', region: 'US', y: '^TNX', s: '10yusy.b', f: '^TNX' },
        { symbol: 'US20Y', name: 'US 20Y Yield', region: 'US', s: '20yusy.b' },
        { symbol: 'US30Y', name: 'US 30Y Yield', region: 'US', y: '^TYX', s: '30yusy.b', f: '^TYX' },
      ],
      'Rate Volatility': [
        { symbol: '^MOVE', name: 'MOVE (Rate Vol)', region: 'US', y: '^MOVE' },
      ],
    },
  },

  commodities: {
    label: 'Commodities',
    groups: {
      'Energy': [
        { symbol: 'CL=F', name: 'WTI Crude',       region: 'US',     y: 'CL=F', s: 'cl.f', f: 'CLUSD' },
        { symbol: 'BZ=F', name: 'Brent Crude',     region: 'Global', y: 'BZ=F', s: 'br.f', f: 'BZUSD' },
        { symbol: 'NG=F', name: 'Natural Gas',     region: 'US',     y: 'NG=F', s: 'ng.f', f: 'NGUSD' },
        { symbol: 'RB=F', name: 'RBOB Gasoline',   region: 'US',     y: 'RB=F', s: 'rb.f', f: 'RBUSD' },
        { symbol: 'HO=F', name: 'Heating Oil',     region: 'US',     y: 'HO=F', s: 'ho.f', f: 'HOUSD' },
      ],
      'Precious Metals': [
        { symbol: 'GC=F', name: 'Gold',      region: 'Global', y: 'GC=F', s: 'gc.f', f: 'GCUSD' },
        { symbol: 'SI=F', name: 'Silver',    region: 'Global', y: 'SI=F', s: 'si.f', f: 'SIUSD' },
        { symbol: 'PL=F', name: 'Platinum',  region: 'Global', y: 'PL=F', s: 'pl.f', f: 'PLUSD' },
        { symbol: 'PA=F', name: 'Palladium', region: 'Global', y: 'PA=F', s: 'pa.f', f: 'PAUSD' },
      ],
      'Industrial Metals': [
        { symbol: 'HG=F', name: 'Copper', region: 'Global', y: 'HG=F', s: 'hg.f', f: 'HGUSD' },
      ],
      'Agriculture': [
        { symbol: 'ZC=F', name: 'Corn',     region: 'US',     y: 'ZC=F', s: 'zc.f' },
        { symbol: 'ZW=F', name: 'Wheat',    region: 'US',     y: 'ZW=F', s: 'zw.f' },
        { symbol: 'ZS=F', name: 'Soybeans', region: 'US',     y: 'ZS=F', s: 'zs.f' },
        { symbol: 'KC=F', name: 'Coffee',   region: 'Global', y: 'KC=F', s: 'kc.f' },
        { symbol: 'CC=F', name: 'Cocoa',    region: 'Global', y: 'CC=F', s: 'cc.f', f: 'CCUSD' },
        { symbol: 'SB=F', name: 'Sugar',    region: 'Global', y: 'SB=F', s: 'sb.f' },
        { symbol: 'CT=F', name: 'Cotton',   region: 'Global', y: 'CT=F', s: 'ct.f' },
      ],
      'Livestock': [
        { symbol: 'LE=F', name: 'Live Cattle', region: 'US', y: 'LE=F', s: 'le.f' },
        { symbol: 'HE=F', name: 'Lean Hogs',   region: 'US', y: 'HE=F', s: 'he.f' },
      ],
    },
  },

  fx: {
    label: 'Foreign Exchange',
    groups: {
      'Dollar Index': [
        { symbol: 'DXY', name: 'DXY (Dollar Index)', region: 'US', y: 'DX-Y.NYB', s: 'dx.f' },
      ],
      'Majors': [
        { symbol: 'EURUSD', name: 'EUR/USD', region: 'EU', a: 'EUR-USD', y: 'EURUSD=X', s: 'eurusd' },
        { symbol: 'GBPUSD', name: 'GBP/USD', region: 'UK', a: 'GBP-USD', y: 'GBPUSD=X', s: 'gbpusd' },
        { symbol: 'USDJPY', name: 'USD/JPY', region: 'JP', a: 'USD-JPY', y: 'JPY=X',    s: 'usdjpy' },
        { symbol: 'USDCHF', name: 'USD/CHF', region: 'CH', a: 'USD-CHF', y: 'CHF=X',    s: 'usdchf' },
        { symbol: 'AUDUSD', name: 'AUD/USD', region: 'AU', a: 'AUD-USD', y: 'AUDUSD=X', s: 'audusd' },
        { symbol: 'NZDUSD', name: 'NZD/USD', region: 'NZ', a: 'NZD-USD', y: 'NZDUSD=X' },
        { symbol: 'USDCAD', name: 'USD/CAD', region: 'CA', a: 'USD-CAD', y: 'CAD=X',    s: 'usdcad' },
      ],
      'Asia': [
        { symbol: 'USDCNY', name: 'USD/CNY', region: 'CN', a: 'USD-CNY', y: 'CNY=X',    s: 'usdcny' },
        { symbol: 'USDHKD', name: 'USD/HKD', region: 'HK', a: 'USD-HKD', y: 'HKD=X',    s: 'usdhkd' },
        { symbol: 'USDSGD', name: 'USD/SGD', region: 'SG', a: 'USD-SGD', y: 'SGD=X',    s: 'usdsgd' },
        { symbol: 'USDKRW', name: 'USD/KRW', region: 'KR', a: 'USD-KRW', y: 'KRW=X',    s: 'usdkrw' },
        { symbol: 'USDTWD', name: 'USD/TWD', region: 'TW', a: 'USD-TWD', y: 'TWD=X',    s: 'usdtwd' },
        { symbol: 'USDINR', name: 'USD/INR', region: 'IN', a: 'USD-INR', y: 'INR=X',    s: 'usdinr' },
        { symbol: 'USDTHB', name: 'USD/THB', region: 'TH', a: 'USD-THB', y: 'THB=X',    s: 'usdthb' },
        { symbol: 'USDIDR', name: 'USD/IDR', region: 'ID', a: 'USD-IDR', y: 'IDR=X',    s: 'usdidr' },
      ],
      'Scandies & Emerging': [
        { symbol: 'USDSEK', name: 'USD/SEK', region: 'SE', a: 'USD-SEK', y: 'SEK=X', s: 'usdsek' },
        { symbol: 'USDNOK', name: 'USD/NOK', region: 'NO', a: 'USD-NOK', y: 'NOK=X', s: 'usdnok' },
        { symbol: 'USDMXN', name: 'USD/MXN', region: 'MX', a: 'USD-MXN', y: 'MXN=X', s: 'usdmxn' },
        { symbol: 'USDBRL', name: 'USD/BRL', region: 'BR', a: 'USD-BRL', y: 'BRL=X', s: 'usdbrl' },
        { symbol: 'USDZAR', name: 'USD/ZAR', region: 'ZA', a: 'USD-ZAR', y: 'ZAR=X', s: 'usdzar' },
        { symbol: 'USDTRY', name: 'USD/TRY', region: 'TR', a: 'USD-TRY', y: 'TRY=X', s: 'usdtry' },
      ],
    },
  },

  crypto: {
    label: 'Crypto',
    groups: {
      'Major': [
        { symbol: 'BTC-USD', name: 'Bitcoin',  region: 'Global', cg: 'bitcoin',  y: 'BTC-USD', s: 'btcusd' },
        { symbol: 'ETH-USD', name: 'Ethereum', region: 'Global', cg: 'ethereum', y: 'ETH-USD', s: 'eth.v'  },
        { symbol: 'SOL-USD', name: 'Solana',   region: 'Global', cg: 'solana',   y: 'SOL-USD', s: 'sol.v'  },
        { symbol: 'XRP-USD', name: 'XRP',        region: 'Global', cg: 'ripple',      y: 'XRP-USD' },
        { symbol: 'ADA-USD', name: 'Cardano',    region: 'Global', cg: 'cardano',     y: 'ADA-USD' },
        { symbol: 'DOGE-USD',name: 'Dogecoin',   region: 'Global', cg: 'dogecoin',    y: 'DOGE-USD' },
        { symbol: 'AVAX-USD',name: 'Avalanche',  region: 'Global', cg: 'avalanche-2', y: 'AVAX-USD' },
        { symbol: 'DOT-USD', name: 'Polkadot',   region: 'Global', cg: 'polkadot',    y: 'DOT-USD' },
        { symbol: 'LINK-USD',name: 'Chainlink',  region: 'Global', cg: 'chainlink',   y: 'LINK-USD' },
      ],
    },
  },
};

export const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const FORWARDS = {
  CL: { label: 'WTI Crude',    suffix: 'NYM', months: 14, unit: '$/bbl'   },
  BZ: { label: 'Brent Crude',  suffix: 'NYM', months: 14, unit: '$/bbl'   },
  NG: { label: 'Natural Gas',  suffix: 'NYM', months: 18, unit: '$/MMBtu' },
  HO: { label: 'Heating Oil',  suffix: 'NYM', months: 12, unit: '$/gal'   },
  RB: { label: 'RBOB Gasoline',suffix: 'NYM', months: 12, unit: '$/gal'   },
  GC: { label: 'Gold',         suffix: 'CMX', months: 18, unit: '$/oz'    },
  SI: { label: 'Silver',       suffix: 'CMX', months: 18, unit: '$/oz'    },
  HG: { label: 'Copper',       suffix: 'CMX', months: 15, unit: '$/lb'    },
  ZC: { label: 'Corn',         suffix: 'CBT', months: 12, unit: '¢/bu'    },
  ZW: { label: 'Wheat',        suffix: 'CBT', months: 12, unit: '¢/bu'    },
  ZS: { label: 'Soybeans',     suffix: 'CBT', months: 12, unit: '¢/bu'    },
};

// Postgres identifier rules: must start with letter or underscore; only
// [a-z0-9_$]. Symbols like '^GSPC', 'CL=F', 'BTC-USD', '000001.SS' need
// normalization.
export function tableName(symbol) {
  let t = symbol.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (/^\d/.test(t)) t = 't_' + t;
  return t;
}

export function generateContracts(root, suffix, months, now = new Date()) {
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < months; i++) {
    const code = MONTH_CODES[m - 1];
    const yy = String(y).slice(-2);
    out.push({
      contract: `${root}${code}${yy}`,
      symbol:   `${root}${code}${yy}.${suffix}`,
      year: y, month: m,
      label: `${MONTH_NAMES[m - 1]} '${yy}`,
      expiry: `${y}-${String(m).padStart(2, '0')}-01`,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// The 15 symbols shown on the Overview page. Worker refreshes these at tier-1
// cadence (1 min) — everything else is tier-2 (10 min).
export const HEADLINE_SYMBOLS = [
  '^GSPC', '^NDX', '^FTSE', '^GDAXI', '^N225', '^HSI', '^STI',
  'US10Y', 'US2Y', 'DXY', 'EURUSD', 'USDJPY',
  'CL=F', 'GC=F', 'BTC-USD',
];

export const TIER_CADENCE_SECONDS = { 1: 60, 2: 600 };

export const RSS_FEEDS = [
  // Markets / macro
  { source: 'CNBC Top News',       url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { source: 'CNBC World',          url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { source: 'CNBC Economy',        url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { source: 'CNBC Markets',        url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html' },
  { source: 'MarketWatch Top',     url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'WSJ Markets',         url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { source: 'WSJ World',           url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { source: 'Bloomberg Markets',   url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { source: 'Bloomberg Economics', url: 'https://feeds.bloomberg.com/economics/news.rss' },
  { source: 'Bloomberg Politics',  url: 'https://feeds.bloomberg.com/politics/news.rss' },
  { source: 'FT World',            url: 'https://www.ft.com/world?format=rss' },
  { source: 'FT Markets',          url: 'https://www.ft.com/markets?format=rss' },
  { source: 'Economist Finance',   url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  { source: 'NYT Business',        url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { source: 'NYT DealBook',        url: 'https://rss.nytimes.com/services/xml/rss/nyt/DealBook.xml' },
  { source: 'NYT Economy',         url: 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml' },
  { source: 'Axios Markets',       url: 'https://api.axios.com/feed/markets' },
  { source: 'Politico Money',      url: 'https://www.politico.com/rss/money.xml' },
  { source: 'Yahoo Finance',       url: 'https://finance.yahoo.com/news/rssindex' },
  { source: 'Investing.com Econ',  url: 'https://www.investing.com/rss/news_25.rss' },
  { source: 'ZeroHedge',           url: 'https://feeds.feedburner.com/zerohedge/feed' },
  // Crypto
  { source: 'CoinDesk',            url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Decrypt',             url: 'https://decrypt.co/feed' },
  { source: 'The Block',           url: 'https://www.theblock.co/rss.xml' },
];

export function flattenSection(sectionKey) {
  const s = SECTIONS[sectionKey];
  if (!s) return [];
  const out = [];
  for (const [group, items] of Object.entries(s.groups)) {
    for (const it of items) out.push({ ...it, group });
  }
  return out;
}
