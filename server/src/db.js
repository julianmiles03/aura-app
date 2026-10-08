import pg from 'pg';
import './env.js';

// int8 (ids, count(*)) and numeric come back as strings by default.
// Our values are small, so plain JS numbers are safe and nicer for the client.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5, // Supabase's free session pooler allows only a handful of connections
  idleTimeoutMillis: 5 * 60 * 1000, // reconnecting to Supabase (TLS) is the slowest part of a request
  keepAlive: true,
});

export const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN/COMMIT; rolls back if fn throws.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
