// Admin-only routes, for the admin portal. An admin is a user with users.is_admin = true
// (set in Supabase's SQL Editor; see README "OKR Metrics"). Everyone else gets 403 NOT_ADMIN.
import { Router } from 'express';
import { query } from '../db.js';
import { forbidden } from '../errors.js';

const router = Router();

async function requireAdmin(req, res, next) {
  const { rows: [me] } = await query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
  if (!me?.is_admin) throw forbidden('NOT_ADMIN', 'Only aura admins can see this.');
  next();
}

// The four Key Results, read live from the okr_metrics view (nothing is cached or stored).
// pct is 0-100 with one decimal, or null while outOf is 0 (e.g. KR3/KR4 before any group has matched).
router.get('/admin/okrs', requireAdmin, async (req, res) => {
  const { rows: [o] } = await query('SELECT *, now() AS as_of FROM okr_metrics');
  res.json({
    asOf: o.as_of,
    totalGroups: o.total_groups,
    connectedGroups: o.connected_groups,
    keyResults: [
      {
        id: 'KR1',
        label: 'Groups that connect with another group',
        count: o.connected_groups,
        outOf: o.total_groups,
        pct: o.kr1_connect_pct,
        drivenBy: 'group_matches: two groups both tap Connect',
      },
      {
        id: 'KR2',
        label: 'Groups with 4+ people',
        count: o.four_plus_groups,
        outOf: o.total_groups,
        pct: o.kr2_four_plus_pct,
        drivenBy: 'group_memberships: a 4th member joins a group',
      },
      {
        id: 'KR3',
        label: 'Connected groups that exchange messages',
        count: o.messaging_groups,
        outOf: o.connected_groups,
        pct: o.kr3_message_pct,
        drivenBy: 'messages: both groups in a match send at least one message',
      },
      {
        id: 'KR4',
        label: 'Connected groups that meet up',
        count: o.meetup_groups,
        outOf: o.connected_groups,
        pct: o.kr4_meetup_pct,
        drivenBy: 'meetups: someone taps "We met up!" in a match chat',
      },
    ],
  });
});

export default router;
