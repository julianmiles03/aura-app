import express from 'express';
import './env.js';
import { pool } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { identify } from './middleware/auth.js';
import chatsRouter from './routes/chats.js';
import groupsRouter from './routes/groups.js';
import matchingRouter from './routes/matching.js';
import meRouter from './routes/me.js';
import publicRouter from './routes/public.js';

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  req.body ??= {};
  const started = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`));
  next();
});

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api', publicRouter);
app.use('/api', identify); // everything below needs X-User-Id
app.use('/api', meRouter);
app.use('/api', groupsRouter);
app.use('/api', matchingRouter);
app.use('/api', chatsRouter);
app.use('/api', (req) => {
  throw notFound('ROUTE_NOT_FOUND', `No API route for ${req.method} ${req.path}.`);
});
app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`aura API listening on http://localhost:${port}`));
