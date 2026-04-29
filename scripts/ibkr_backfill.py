"""Backfill historical OHLC bars from IBKR via the TWS socket API.

Connects to a running IB Gateway (host/port from IBKR_HOST/IBKR_PORT env, defaults
127.0.0.1:4001), looks up contracts for each macro-dashboard symbol via the
IBKR_MAP table below, fetches daily bars, and inserts them into the per-symbol
Postgres tables in <schema>.<table_name> (resolved from meta.symbols).

Usage:
    .venv/bin/python scripts/ibkr_backfill.py                  # all mapped symbols
    .venv/bin/python scripts/ibkr_backfill.py --section indices
    .venv/bin/python scripts/ibkr_backfill.py --symbol '^GSPC'
    .venv/bin/python scripts/ibkr_backfill.py --duration '1 Y'

The script is idempotent (ON CONFLICT DO NOTHING). Re-runs only insert dates
that aren't already in the table.
"""
import argparse
import asyncio
import os
import sys
import time
from typing import Optional

import psycopg
from dotenv import load_dotenv
from ib_async import IB, ContFuture, Crypto, Forex, Future, Index, Stock, Contract

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.environ['DATABASE_URL']
IBKR_HOST = os.environ.get('IBKR_HOST', '127.0.0.1')
IBKR_PORT = int(os.environ.get('IBKR_PORT', '4001'))
IBKR_CLIENT_ID = int(os.environ.get('IBKR_CLIENT_ID', '101'))

# Maps our canonical symbol -> (ib_async Contract factory, whatToShow)
# whatToShow: TRADES for stocks/indices/commodities, MIDPOINT for FX, AGGTRADES for crypto.
def _idx(s, ex, c='USD'): return Index(s, ex, c), 'TRADES'
def _stk(s, ex, c='USD'): return Stock(s, ex, c), 'TRADES'
def _cf(s, ex, c='USD'):  return ContFuture(s, ex, currency=c), 'TRADES'
def _fx(p):               return Forex(p), 'MIDPOINT'
def _cr(s, c='USD'):      return Crypto(s, 'PAXOS', c), 'AGGTRADES'

IBKR_MAP = {
    # Indices
    '^GSPC':     _idx('SPX',     'CBOE'),
    '^DJI':      _idx('DJX',     'CBOE'),
    '^NDX':      _idx('NDX',     'NASDAQ'),
    '^IXIC':     _idx('COMP',    'NASDAQ'),
    '^RUT':      _idx('RUT',     'RUSSELL'),
    '^VIX':      _idx('VIX',     'CBOE'),
    '^GSPTSE':   _idx('TSX',     'TSE',     'CAD'),
    '^GDAXI':    _idx('DAX',     'EUREX',   'EUR'),
    '^MDAXI':    _idx('MDAX',    'EUREX',   'EUR'),
    '^FCHI':     _idx('CAC40',   'MONEP',   'EUR'),
    '^STOXX50E': _idx('ESTX50',  'EUREX',   'EUR'),
    '^IBEX':     _idx('IBEX35',  'MEFFRV',  'EUR'),
    '^OMX':      _idx('OMXS30',  'OMS',     'SEK'),
    # Skipped (no working IBKR mapping found from this account's data subs):
    #   ^FTSE, ^FTMC, ^STOXX (Stoxx 600), ^AEX, ^SSMI, FTSEMIB.MI
    '^N225':     _idx('N225',    'OSE.JPN', 'JPY'),
    '^TOPX':     _idx('TOPX',    'OSE.JPN', 'JPY'),
    '^HSI':      _idx('HSI',     'HKFE',    'HKD'),
    '^STI':      _idx('STI',     'SGX',     'SGD'),
    '^KS11':     _idx('K200',    'KSE',     'KRW'),
    '^AXJO':     _idx('XJO',     'ASX',     'AUD'),
    '^NSEI':     _idx('NIFTY50', 'NSE',     'INR'),
    # Skipped: ^HSCE, ^BSESN (no permission), 000001.SS, 399001.SZ, ^TWII, ^NZ50, ^JKSE, ^KLSE, ^SET, ^BVSP, ^MXX, ^IXIC (works as COMP)

    # Commodities continuous futures
    'CL=F': _cf('CL',  'NYMEX'),
    'BZ=F': _cf('BZ',  'NYMEX'),
    'NG=F': _cf('NG',  'NYMEX'),
    'RB=F': _cf('RB',  'NYMEX'),
    'HO=F': _cf('HO',  'NYMEX'),
    'GC=F': _cf('GC',  'COMEX'),
    'SI=F': _cf('SI',  'COMEX'),
    'PL=F': _cf('PL',  'NYMEX'),
    'PA=F': _cf('PA',  'NYMEX'),
    'HG=F': _cf('HG',  'COMEX'),
    'ZC=F': _cf('ZC',  'CBOT'),
    'ZW=F': _cf('ZW',  'CBOT'),
    'ZS=F': _cf('ZS',  'CBOT'),
    'KC=F': _cf('KC',  'NYBOT'),
    'CC=F': _cf('CC',  'NYBOT'),
    'SB=F': _cf('SB',  'NYBOT'),
    'CT=F': _cf('CT',  'NYBOT'),
    'LE=F': _cf('LE',  'CME'),
    'HE=F': _cf('HE',  'CME'),

    # FX (IDEALPRO via Forex())
    'EURUSD': _fx('EURUSD'),
    'GBPUSD': _fx('GBPUSD'),
    'USDJPY': _fx('USDJPY'),
    'USDCHF': _fx('USDCHF'),
    'AUDUSD': _fx('AUDUSD'),
    'NZDUSD': _fx('NZDUSD'),
    'USDCAD': _fx('USDCAD'),
    'USDCNY': _fx('USDCNH'),  # IBKR uses CNH (offshore yuan), not CNY
    'USDHKD': _fx('USDHKD'),
    'USDSGD': _fx('USDSGD'),
    'USDKRW': _fx('USDKRW'),
    'USDINR': _fx('USDINR'),
    'USDSEK': _fx('USDSEK'),
    'USDNOK': _fx('USDNOK'),
    'USDMXN': _fx('USDMXN'),
    'USDZAR': _fx('USDZAR'),
    'USDTRY': _fx('USDTRY'),

    # Crypto (PAXOS — IBKR's crypto exchange)
    'BTC-USD':  _cr('BTC'),
    'ETH-USD':  _cr('ETH'),

    # Rates — IBKR provides yield indices on CBOE
    'US10Y': _idx('TNX', 'CBOE'),
    'US5Y':  _idx('FVX', 'CBOE'),
    'US30Y': _idx('TYX', 'CBOE'),
    'US3M':  _idx('IRX', 'CBOE'),
}

# Futures roots → IBKR exchange. Used to build Future contracts for monthly
# delivery contracts in meta.symbols (is_future=true).
FUTURES_EXCHANGES = {
    'CL': 'NYMEX', 'BZ': 'NYMEX', 'NG': 'NYMEX', 'RB': 'NYMEX', 'HO': 'NYMEX',
    'GC': 'COMEX', 'SI': 'COMEX', 'HG': 'COMEX',
    'ZC': 'CBOT', 'ZW': 'CBOT', 'ZS': 'CBOT',
}

# IBKR_MAP keys we don't have on this account (skip rather than error):
# 000001.SS, 399001.SZ, ^TWII, ^NZ50, ^JKSE, ^KLSE, ^SET, ^BVSP, ^MXX,
# DXY, USDTWD, USDTHB, USDIDR, USDBRL, US3Y/US7Y/US20Y, etc.
# Add to IBKR_MAP above when needed.


def insert_bars(conn, schema: str, table: str, section: str, bars, source='ibkr'):
    if not bars:
        return 0
    # Match the column shape used by db-init: fx has no volume; rates is yield-only.
    cols_sql = {
        'rates': 'date, yield, source',
        'fx':    'date, open, high, low, close, source',
    }.get(section, 'date, open, high, low, close, volume, source')
    n_cols = cols_sql.count(',') + 1
    placeholders = ','.join(f'(${1 + i*n_cols},' + ','.join(f'${2 + i*n_cols + j}' for j in range(n_cols-1)) + ')'
                            for i in range(len(bars)))
    # Easier: build with %s placeholders for psycopg
    rows = []
    for b in bars:
        d = b.date.isoformat() if hasattr(b.date, 'isoformat') else str(b.date)
        if section == 'rates':
            # IBKR's CBOE yield indices (TNX/TYX/FVX/IRX) report yield × 10
            # (e.g. 43.54 for a 4.354% yield). Normalise to actual percent.
            rows.append((d, float(b.close) / 10.0, source))
        elif section == 'fx':
            rows.append((d, float(b.open), float(b.high), float(b.low), float(b.close), source))
        else:
            vol = int(b.volume) if b.volume and b.volume > 0 else None
            rows.append((d, float(b.open), float(b.high), float(b.low), float(b.close), vol, source))
    placeholders = ','.join(['(' + ','.join(['%s'] * n_cols) + ')'] * len(rows))
    flat = [v for row in rows for v in row]
    sql = (f'INSERT INTO {schema}.{table} ({cols_sql}) VALUES {placeholders} '
           f'ON CONFLICT (date) DO NOTHING')
    with conn.cursor() as cur:
        cur.execute(sql, flat)
        return cur.rowcount


async def backfill_one(ib: IB, conn, sym_meta, duration: str, bar_size='1 day'):
    sym = sym_meta['symbol']
    if sym_meta.get('is_future'):
        root = sym_meta['futures_root']
        exch = FUTURES_EXCHANGES.get(root)
        if not exch:
            return {'symbol': sym, 'status': 'skipped', 'reason': f'no_futures_exchange_for_{root}'}
        ymonth = f'{sym_meta["futures_year"]:04d}{sym_meta["futures_month"]:02d}'
        contract = Future(root, lastTradeDateOrContractMonth=ymonth, exchange=exch, currency='USD')
        what_to_show = 'TRADES'
    elif sym in IBKR_MAP:
        contract, what_to_show = IBKR_MAP[sym]
    else:
        return {'symbol': sym, 'status': 'skipped', 'reason': 'no_mapping'}
    try:
        q = await ib.qualifyContractsAsync(contract)
        if not q or q[0] is None or not getattr(q[0], 'conId', None):
            return {'symbol': sym, 'status': 'qualify_failed'}
        contract = q[0]
    except Exception as e:
        return {'symbol': sym, 'status': 'qualify_error', 'reason': str(e)}
    try:
        bars = await ib.reqHistoricalDataAsync(
            contract, endDateTime='', durationStr=duration,
            barSizeSetting=bar_size, whatToShow=what_to_show,
            useRTH=True, formatDate=1, timeout=60,
        )
    except Exception as e:
        return {'symbol': sym, 'status': 'fetch_error', 'reason': str(e)}
    if not bars:
        return {'symbol': sym, 'status': 'empty'}
    inserted = insert_bars(conn, sym_meta['schema_name'], sym_meta['table_name'],
                           sym_meta['section'], bars, source='ibkr')
    conn.commit()
    return {'symbol': sym, 'status': 'ok', 'rows': len(bars), 'inserted': inserted,
            'first': str(bars[0].date), 'last': str(bars[-1].date)}


async def main():
    p = argparse.ArgumentParser()
    p.add_argument('--section')
    p.add_argument('--symbol')
    p.add_argument('--duration', default='5 Y',
                   help="IBKR durationStr (e.g. '1 M', '6 M', '1 Y', '5 Y', '10 Y')")
    p.add_argument('--throttle', type=float, default=3.0,
                   help='Seconds between historical data requests (rate-limit guard)')
    p.add_argument('--futures', action='store_true',
                   help='Backfill futures monthly contracts (is_future=true) instead of spot')
    p.add_argument('--all', action='store_true',
                   help='Both spot and futures')
    args = p.parse_args()

    conn = psycopg.connect(DATABASE_URL)
    q = ("SELECT symbol, name, section, schema_name, table_name, is_future, "
         "futures_root, futures_year, futures_month FROM meta.symbols WHERE 1=1")
    if args.futures and not args.all:
        q += ' AND is_future = true'
    elif not args.all:
        q += ' AND is_future = false'
    qa = []
    if args.section:
        qa.append(args.section); q += f' AND section = %s'
    if args.symbol:
        qa.append(args.symbol);  q += f' AND symbol = %s'
    q += ' ORDER BY is_future, section, symbol'
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(q, qa)
        symbols = cur.fetchall()
    n_spot = sum(1 for s in symbols if not s['is_future'])
    n_fut = sum(1 for s in symbols if s['is_future'])
    print(f'fetched {len(symbols)} symbols from meta.symbols ({n_spot} spot, {n_fut} futures)')

    ib = IB()
    await ib.connectAsync(IBKR_HOST, IBKR_PORT, clientId=IBKR_CLIENT_ID, timeout=30)
    print(f'connected to IB Gateway at {IBKR_HOST}:{IBKR_PORT}')

    t0 = time.time()
    ok = err = skipped = empty = 0
    total_inserted = 0
    for i, sym_meta in enumerate(symbols, 1):
        r = await backfill_one(ib, conn, sym_meta, args.duration)
        sym = r['symbol']
        s = r['status']
        if s == 'ok':
            ok += 1
            total_inserted += r['inserted']
            tag = f"OK {r['inserted']}/{r['rows']} bars [{r['first']}..{r['last']}]"
        elif s == 'skipped':
            skipped += 1; tag = f"SKIP {r['reason']}"
        elif s == 'empty':
            empty += 1; tag = "EMPTY"
        else:
            err += 1; tag = f"{s.upper()} {r.get('reason', '')[:80]}"
        print(f'  {i:3}/{len(symbols)}  {sym:14} {tag}')
        sys.stdout.flush()
        if i < len(symbols) and s == 'ok':
            await asyncio.sleep(args.throttle)

    ib.disconnect()
    conn.close()
    print('---')
    print(f'done in {(time.time() - t0):.1f}s')
    print(f'ok={ok} err={err} skipped={skipped} empty={empty}, rows inserted={total_inserted}')


if __name__ == '__main__':
    asyncio.run(main())
