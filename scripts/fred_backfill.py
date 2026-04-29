"""Backfill FRED macro series from St. Louis Fed's public CSV download endpoint.

No API key required — uses https://fred.stlouisfed.org/graph/fredgraph.csv?id=…
which serves the same data.

Usage:
    .venv/bin/python scripts/fred_backfill.py                    # all series
    .venv/bin/python scripts/fred_backfill.py --series DGS10
    .venv/bin/python scripts/fred_backfill.py --group Yields
"""
import argparse
import csv
import io
import os
import sys
import time
import urllib.parse

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.environ['DATABASE_URL']
UA = 'macro-dashboard/0.1 (FRED backfill)'


def fetch_fred_csv(series_id: str):
    """Returns list of (date_str, value_str_or_None) tuples."""
    url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={urllib.parse.quote(series_id)}'
    resp = requests.get(url, headers={'User-Agent': UA}, timeout=60)
    resp.raise_for_status()
    text = resp.text
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header:
        raise RuntimeError(f'empty CSV for {series_id}')
    # Header may be "DATE,SERIES_ID" with old format, or "observation_date,SERIES_ID"
    rows = []
    for row in reader:
        if len(row) < 2:
            continue
        date, val = row[0], row[1]
        if val == '.' or val == '':
            rows.append((date, None))
        else:
            try:
                rows.append((date, float(val)))
            except ValueError:
                rows.append((date, None))
    return rows


def insert_observations(conn, table: str, rows):
    if not rows:
        return 0
    valid = [(d, v) for d, v in rows if v is not None]
    if not valid:
        return 0
    placeholders = ','.join(['(%s, %s, %s)'] * len(valid))
    flat = []
    for d, v in valid:
        flat.extend([d, v, 'fred'])
    sql = (f'INSERT INTO macro.{table} (date, value, source) VALUES {placeholders} '
           f'ON CONFLICT (date) DO NOTHING')
    with conn.cursor() as cur:
        cur.execute(sql, flat)
        return cur.rowcount


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--series')
    p.add_argument('--group')
    p.add_argument('--throttle', type=float, default=0.3,
                   help='Seconds between FRED requests (FRED is generous; 0.3 keeps us polite)')
    args = p.parse_args()

    conn = psycopg.connect(DATABASE_URL)
    q = "SELECT id, name, group_name, table_name FROM macro.series WHERE 1=1"
    qa = []
    if args.series: qa.append(args.series); q += ' AND id = %s'
    if args.group:  qa.append(args.group);  q += ' AND group_name = %s'
    q += ' ORDER BY group_name, id'
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(q, qa)
        series = cur.fetchall()
    print(f'fetched {len(series)} series from macro.series')

    t0 = time.time()
    ok = err = 0
    total = 0
    for i, s in enumerate(series, 1):
        try:
            rows = fetch_fred_csv(s['id'])
            inserted = insert_observations(conn, s['table_name'], rows)
            conn.commit()
            ok += 1
            total += inserted
            first = rows[0][0] if rows else '-'
            last = rows[-1][0] if rows else '-'
            print(f'  {i:3}/{len(series)}  {s["id"]:10} OK {inserted}/{len(rows)} obs [{first}..{last}] ({s["group_name"]})')
            with conn.cursor() as cur:
                cur.execute('UPDATE macro.series SET last_obs = %s, updated_at = now() WHERE id = %s',
                            (last if last != '-' else None, s['id']))
                conn.commit()
        except Exception as e:
            err += 1
            print(f'  {i:3}/{len(series)}  {s["id"]:10} ERROR {str(e)[:80]}')
        sys.stdout.flush()
        if i < len(series):
            time.sleep(args.throttle)

    conn.close()
    print('---')
    print(f'done in {(time.time() - t0):.1f}s')
    print(f'ok={ok} err={err}, observations inserted={total}')


if __name__ == '__main__':
    main()
