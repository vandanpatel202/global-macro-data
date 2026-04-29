// FRED (St. Louis Fed) macro series. Used by db-init.js to provision per-series
// tables and seed the macro.series registry, and by server.js to expose them
// through /api/macro endpoints.

export const FRED_SERIES = {
  // ---------- Yields (Treasury Constant Maturity, daily, % per annum) ----------
  DGS1MO: { name: '1-Month Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  DGS3MO: { name: '3-Month Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  DGS6MO: { name: '6-Month Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  DGS1:   { name: '1-Year Treasury',   group: 'Yields', units: '%',     freq: 'Daily' },
  DGS2:   { name: '2-Year Treasury',   group: 'Yields', units: '%',     freq: 'Daily' },
  DGS3:   { name: '3-Year Treasury',   group: 'Yields', units: '%',     freq: 'Daily' },
  DGS5:   { name: '5-Year Treasury',   group: 'Yields', units: '%',     freq: 'Daily' },
  DGS7:   { name: '7-Year Treasury',   group: 'Yields', units: '%',     freq: 'Daily' },
  DGS10:  { name: '10-Year Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  DGS20:  { name: '20-Year Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  DGS30:  { name: '30-Year Treasury',  group: 'Yields', units: '%',     freq: 'Daily' },
  T10Y2Y: { name: '10Y - 2Y Spread',   group: 'Yields', units: '%',     freq: 'Daily' },
  T10Y3M: { name: '10Y - 3M Spread',   group: 'Yields', units: '%',     freq: 'Daily' },

  // ---------- Inflation ----------
  CPIAUCSL:  { name: 'CPI All Urban Consumers (NSA)', group: 'Inflation', units: 'Index 1982-84=100', freq: 'Monthly' },
  CPILFESL:  { name: 'Core CPI (ex Food & Energy)',   group: 'Inflation', units: 'Index 1982-84=100', freq: 'Monthly' },
  PCEPI:     { name: 'PCE Price Index',               group: 'Inflation', units: 'Index 2017=100',    freq: 'Monthly' },
  PCEPILFE:  { name: 'Core PCE Price Index',          group: 'Inflation', units: 'Index 2017=100',    freq: 'Monthly' },
  PPIACO:    { name: 'PPI All Commodities',           group: 'Inflation', units: 'Index 1982=100',    freq: 'Monthly' },

  // ---------- Employment ----------
  UNRATE:   { name: 'Unemployment Rate',          group: 'Employment', units: '%',                 freq: 'Monthly' },
  U6RATE:   { name: 'U-6 Unemployment (broader)', group: 'Employment', units: '%',                 freq: 'Monthly' },
  PAYEMS:   { name: 'Total Nonfarm Payrolls',     group: 'Employment', units: 'Thousands',         freq: 'Monthly' },
  CIVPART:  { name: 'Labor Force Participation',  group: 'Employment', units: '%',                 freq: 'Monthly' },
  ICSA:     { name: 'Initial Jobless Claims',     group: 'Employment', units: 'Number',            freq: 'Weekly'  },

  // ---------- Activity ----------
  GDP:      { name: 'Gross Domestic Product',     group: 'Activity', units: 'Billions $',           freq: 'Quarterly' },
  GDPC1:    { name: 'Real GDP',                    group: 'Activity', units: 'Billions Chained $',  freq: 'Quarterly' },
  INDPRO:   { name: 'Industrial Production',       group: 'Activity', units: 'Index 2017=100',      freq: 'Monthly'   },
  HOUST:    { name: 'Housing Starts',              group: 'Activity', units: 'Thousands',           freq: 'Monthly'   },
  PERMIT:   { name: 'Building Permits',            group: 'Activity', units: 'Thousands',           freq: 'Monthly'   },
  RSAFS:    { name: 'Retail Sales',                group: 'Activity', units: 'Millions $',          freq: 'Monthly'   },
  PCE:      { name: 'Personal Consumption',        group: 'Activity', units: 'Billions $',          freq: 'Monthly'   },
  TCU:      { name: 'Capacity Utilization',        group: 'Activity', units: '%',                   freq: 'Monthly'   },

  // ---------- Money & Rates ----------
  FEDFUNDS: { name: 'Fed Funds Rate (monthly)',    group: 'Money & Rates', units: '%',          freq: 'Monthly' },
  DFF:      { name: 'Effective Fed Funds (daily)', group: 'Money & Rates', units: '%',          freq: 'Daily'   },
  SOFR:     { name: 'SOFR',                         group: 'Money & Rates', units: '%',          freq: 'Daily'   },
  M1SL:     { name: 'M1 Money Stock',                group: 'Money & Rates', units: 'Billions $', freq: 'Monthly' },
  M2SL:     { name: 'M2 Money Stock',                group: 'Money & Rates', units: 'Billions $', freq: 'Monthly' },
  WALCL:    { name: 'Fed Balance Sheet',             group: 'Money & Rates', units: 'Millions $', freq: 'Weekly'  },

  // ---------- Sentiment & Other ----------
  UMCSENT:  { name: 'U-Mich Consumer Sentiment',  group: 'Sentiment', units: 'Index',           freq: 'Monthly' },
  STLFSI4:  { name: 'St. Louis Fed Financial Stress Index', group: 'Sentiment', units: 'Index', freq: 'Weekly'  },
};

// Postgres-safe table name (lower, _ for non-alnum). Series IDs are already
// almost-clean (DGS10 -> dgs10), but a couple have dots/digits so we still
// canonicalise.
export function fredTableName(seriesId) {
  return seriesId.toLowerCase().replace(/[^a-z0-9]/g, '_');
}
