// One-shot economic-calendar refresh (Forex Factory weekly XML).
import pg from 'pg';
import { calendarTick } from '../../lib/worker.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 8000 });
try {
  await calendarTick(pool);
} finally {
  await pool.end();
}
