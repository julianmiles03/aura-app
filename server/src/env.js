// Loads server/.env (no matter which folder the process was started from)
// and fails fast with a helpful message if DATABASE_URL is missing.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url || /YOUR-PASSWORD|<[a-z-]+>/i.test(url)) {
  console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and paste the Find Friends App Session pooler URI (see README).');
  process.exit(1);
}
