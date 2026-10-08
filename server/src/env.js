// Loads server/.env (no matter which folder the process was started from)
// and fails fast with a helpful message if DATABASE_URL is missing.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('YOUR-PASSWORD')) {
  console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and paste your Supabase connection string.');
  process.exit(1);
}
