export interface MarketItem {
  symbol: string;
  name: string;
  region: string;
  group?: string;
  price?: number;
  prevClose?: number;
  change?: number;
  pct?: number;
  currency?: string;
  marketState?: string;
  spark?: number[];
  ts?: number;
  source?: 'yahoo' | 'stooq';
  error?: boolean;
}

export interface SectionPayload {
  key: string;
  label: string;
  groups: Record<string, MarketItem[]>;
  updatedAt: number;
}

export interface OverviewPayload {
  tiles: MarketItem[];
  updatedAt: number;
}

export interface NewsItem {
  source: string;
  title: string;
  link: string;
  isoDate: string | null;
  contentSnippet: string;
}

export interface NewsPayload {
  items: NewsItem[];
  sources: string[];
  updatedAt: number;
}

export type SectionKey = 'indices' | 'rates' | 'commodities' | 'fx' | 'crypto';

export interface FuturePoint {
  contract: string;
  label: string;
  expiry: string;
  year: number;
  month: number;
  price: number;
  prevClose?: number;
}

export type CurveShape = 'contango' | 'backwardation' | 'flat' | 'mixed';

export interface FuturesPayload {
  root: string;
  label: string;
  unit: string;
  shape: CurveShape;
  points: FuturePoint[];
  updatedAt: number;
}

export interface FuturesRoot {
  root: string;
  label: string;
  unit: string;
}

export type HistoryRange = '1w' | '1m' | '3m' | '6m' | '1y';

export interface HistoryPoint {
  date: string;       // YYYY-MM-DD
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface HistoryPayload {
  symbol: string;
  range: HistoryRange | string;
  points: HistoryPoint[];
}

export interface TrendingTicker {
  ticker: string;
  mentions: number;
  posts: number;
  lastSeen: string;
}

export interface TrendingPayload {
  window: string;
  items: TrendingTicker[];
  updatedAt: number;
}

export interface SentimentPost {
  id: string;
  source: string;
  title: string;
  url: string;
  author: string;
  score: number | null;
  numComments: number | null;
  createdAt: string;
}

export interface TickerPostsPayload {
  ticker: string;
  window: string;
  posts: SentimentPost[];
}

export interface MacroSeriesMeta {
  id: string;
  name: string;
  group: string;
  units: string;
  frequency: string;
  last_obs: string | null;
}

export interface MacroIndexPayload {
  groups: Record<string, MacroSeriesMeta[]>;
}

export interface MacroPoint {
  date: string;
  value: number | null;
}

export interface MacroSeriesPayload {
  id: string;
  name: string;
  group: string;
  units: string;
  frequency: string;
  range: string;
  points: MacroPoint[];
}

export interface CalendarEvent {
  id: number;
  title: string;
  country: string;
  scheduled_at: string | null;
  scheduled_date: string;
  time_label: string | null;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  url: string | null;
}

export interface CalendarPayload {
  events: CalendarEvent[];
  updatedAt: number;
}

export interface CronTaskStatus {
  name: string;
  schedule: string;
  expectedSec: number;
  lastAt: string | null;
  recent: number | null;
  total: number | null;
  logExists?: boolean;
  logMtime?: string | null;
  logTail?: string[];
}

export interface CronStatusPayload {
  tasks: CronTaskStatus[];
  logDir: string;
  generatedAt: number;
}
