// Runs db/schema.sql then db/seed.sql against DATABASE_URL (from server/.env).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import '../src/env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const file of ['db/schema.sql', 'db/seed.sql']) {
    process.stdout.write(`Running ${file} ... `);
    await client.query(await readFile(path.join(root, file), 'utf8'));
    console.log('done');
  }
  const { rows } = await client.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM friend_groups) AS groups');
  console.log(`Database ready: ${rows[0].users} users, ${rows[0].groups} groups.`);
} catch (err) {
  console.error(`\nDatabase reset failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
