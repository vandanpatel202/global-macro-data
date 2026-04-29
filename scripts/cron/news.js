// One-shot RSS poll. Designed to be run by cron; see ../setup_cron.sh.
import pg from 'pg';
import { newsTick } from '../../lib/worker.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 8000 });
try {
  await newsTick(pool);
} finally {
  await pool.end();
}
