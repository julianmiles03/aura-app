// Routes for the admin portal (#/admin). They use the portal's own sign-in (an httpOnly session
// cookie, see lib/adminAuth.js), not the app's Supabase session, so index.js mounts this router
// before the app's `authenticate`. Login, logout and session are open to anyone; every other
// /api/admin route answers 401 ADMIN_SIGNED_OUT without a valid admin session.
import { Router } from 'express';
import { pool, query } from '../db.js';
import { notFound } from '../errors.js';
import { currentAdmin, logIn, logOut, requireAdminSession } from '../lib/adminAuth.js';
import adminGroupsRouter from './adminGroups.js';
import adminInterestsRouter from './adminInterests.js';
import adminMeetupsRouter from './adminMeetups.js';
import adminUsersRouter from './adminUsers.js';

const router = Router();

// ---------------------------------------------------------------------------
// Signing in and out (no session needed)
// ---------------------------------------------------------------------------
// Body: { user_email, user_password }, the same names as the login form's fields and the
// admin_users columns. 200 sets the aura_admin cookie; 401 ADMIN_LOGIN_FAILED if they don't match.
router.post('/admin/login', async (req, res) => {
  const admin = await logIn(req, res, { email: req.body.user_email, password: req.body.user_password });
  res.json({ admin });
});

// Always 204, even if there was no session, so the portal can always show the signed-out page.
router.post('/admin/logout', async (req, res) => {
  await logOut(req, res);
  res.sendStatus(204);
});

// Who's signed in on this browser: { admin: { email, expiresAt } } or { admin: null }.
// The portal asks on load to decide between the login form and the admin tools.
router.get('/admin/session', async (req, res) => {
  const admin = await currentAdmin(req, res);
  res.json({ admin: admin && { email: admin.email, expiresAt: admin.expiresAt } });
});

// ---------------------------------------------------------------------------
// Everything below needs a valid admin session (401 ADMIN_SIGNED_OUT otherwise)
// ---------------------------------------------------------------------------
router.use('/admin', requireAdminSession);

// Maintain Groups: create, view, edit and delete groups and their members (routes/adminGroups.js).
router.use(adminGroupsRouter);
// Maintain Users: the users table with add, edit and delete (routes/adminUsers.js).
router.use(adminUsersRouter);
// Maintain Interests and Maintain Meetups: create, list, edit and delete (routes/adminInterests.js,
// routes/adminMeetups.js).
router.use(adminInterestsRouter);
router.use(adminMeetupsRouter);

// Team Aura's goal for each Key Result, as a percentage (README "OKR Metrics"). These are the
// targets the dashboard compares against; the KR values themselves always come from the database.
const TARGETS = { KR1: 50, KR2: 40, KR3: 60, KR4: 25 };

// The four Key Results, read live from the okr_metrics view (nothing is cached or stored).
// pct is 0-100 with one decimal, or null while outOf is 0 (e.g. KR3/KR4 before any group has matched).
router.get('/admin/okrs', async (req, res) => {
  const { rows: [o] } = await query('SELECT *, now() AS as_of FROM okr_metrics');
  res.json({
    asOf: o.as_of,
    totalGroups: o.total_groups,
    connectedGroups: o.connected_groups,
    keyResults: [
      {
        id: 'KR1',
        target: TARGETS.KR1,
        label: 'Groups that connect with another group',
        count: o.connected_groups,
        outOf: o.total_groups,
        pct: o.kr1_connect_pct,
        drivenBy: 'group_matches: two groups both tap Connect',
      },
      {
        id: 'KR2',
        target: TARGETS.KR2,
        label: 'Groups with 4+ people',
        count: o.four_plus_groups,
        outOf: o.total_groups,
        pct: o.kr2_four_plus_pct,
        drivenBy: 'group_memberships: a 4th member joins a group',
      },
      {
        id: 'KR3',
        target: TARGETS.KR3,
        label: 'Connected groups that exchange messages',
        count: o.messaging_groups,
        outOf: o.connected_groups,
        pct: o.kr3_message_pct,
        drivenBy: 'messages: both groups in a match send at least one message',
      },
      {
        id: 'KR4',
        target: TARGETS.KR4,
        label: 'Connected groups that meet up',
        count: o.meetup_groups,
        outOf: o.connected_groups,
        pct: o.kr4_meetup_pct,
        drivenBy: 'meetups: someone taps "We met up!" in a match chat',
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Maintain Users / Maintain Records: read-only views of the app's tables
// ---------------------------------------------------------------------------
// The tables the portal can open, in the order it lists them. Maintain Users opens `users`;
// Maintain Records lists the rest. A name from the URL is only ever looked up in this list and
// never copied into SQL, so no other table can be read this way. admin_users and admin_sessions
// are left out on purpose: they hold password and session hashes.
const TABLES = [
  { name: 'users', label: 'Users', about: 'Everyone with an aura profile.', newestFirst: 'id DESC' },
  { name: 'user_photos', label: 'User photos', about: "Profile photos. Position 1 is a person's main photo.", newestFirst: 'id DESC' },
  { name: 'interests', label: 'Interests', about: 'Every interest anyone has added.', newestFirst: 'id DESC' },
  { name: 'user_interests', label: 'User interests', about: 'Which person picked which interest.', newestFirst: 'added_at DESC' },
  { name: 'friendships', label: 'Friendships', about: 'Pairs of friends, used to rank mutual friends on Find.', newestFirst: 'created_at DESC' },
  { name: 'friend_groups', label: 'Friend groups', about: 'Groups of up to 10 friends.', newestFirst: 'id DESC' },
  { name: 'group_memberships', label: 'Group members', about: 'Who is in which group, and who owns it.', newestFirst: 'joined_at DESC' },
  { name: 'group_likes', label: 'Connects and passes', about: 'Each Connect or Pass one group gave another.', newestFirst: 'id DESC' },
  { name: 'group_matches', label: 'Matches', about: 'Pairs of groups that both chose Connect.', newestFirst: 'id DESC' },
  { name: 'chats', label: 'Chats', about: 'The group chat each match opens.', newestFirst: 'id DESC' },
  { name: 'chat_participants', label: 'Chat participants', about: 'Who is in each chat, and how far they have read.', newestFirst: 'joined_at DESC' },
  { name: 'messages', label: 'Messages', about: 'Messages sent in group chats.', newestFirst: 'id DESC' },
  { name: 'chat_suggestions', label: 'Conversation starters', about: 'The AI openers offered in new match chats.', newestFirst: 'id DESC' },
  { name: 'meetups', label: 'Meetups', about: '"We met up!" confirmations, which feed KR4.', newestFirst: 'id DESC' },
];
const ROW_LIMIT = 50; // newest rows shown per table

// Every table with how many rows it has: { tables: [{ name, label, about, rowCount }] }.
router.get('/admin/tables', async (req, res) => {
  // One query counts them all. The names are the fixed ones in TABLES, never user input.
  const { rows } = await query(TABLES.map((t) => `SELECT '${t.name}' AS name, count(*) AS row_count FROM ${t.name}`).join(' UNION ALL '));
  const counts = Object.fromEntries(rows.map((r) => [r.name, r.row_count]));
  res.json({ tables: TABLES.map(({ name, label, about }) => ({ name, label, about, rowCount: counts[name] })) });
});

// One table's newest rows. columns are the database's own column names (so snake_case), and each
// row is an array of values in that order, the way the portal draws them as a table.
router.get('/admin/tables/:name', async (req, res) => {
  const table = TABLES.find((t) => t.name === req.params.name);
  if (!table) throw notFound('TABLE_NOT_FOUND', "The admin portal doesn't have a table by that name.");
  const { rows: [{ row_count: rowCount }] } = await query(`SELECT count(*) AS row_count FROM ${table.name}`);
  const result = await pool.query({
    text: `SELECT * FROM ${table.name} ORDER BY ${table.newestFirst} LIMIT ${ROW_LIMIT}`,
    rowMode: 'array',
  });
  res.json({
    name: table.name,
    label: table.label,
    about: table.about,
    rowCount,
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
  });
});

// Any other /api/admin path: 404 here instead of falling through to the app's routes, which would
// answer 401 NOT_SIGNED_IN because admins don't send the app's Supabase session.
router.use('/admin', (req) => {
  throw notFound('ROUTE_NOT_FOUND', `No API route for ${req.method} ${req.originalUrl.split('?')[0]}.`);
});

export default router;
