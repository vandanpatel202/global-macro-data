// One-shot Reddit sentiment scrape.
import pg from 'pg';
import { sentimentTick } from '../../lib/worker.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 8000 });
try {
  await sentimentTick(pool);
} finally {
  await pool.end();
}
