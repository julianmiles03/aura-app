import { query } from '../db.js';
import { ApiError, forbidden } from '../errors.js';
import { parseId } from '../lib/validate.js';

// Prototype auth: the client's "Signed in as" picker sends X-User-Id.
export async function identify(req, res, next) {
  const raw = req.get('X-User-Id');
  if (!raw) throw new ApiError(401, 'NOT_SIGNED_IN', 'Pick who you are in "Signed in as" first.');
  const id = parseId(raw, 'X-User-Id');
  const { rows } = await query('SELECT id, first_name, city, active_group_id FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new ApiError(401, 'UNKNOWN_USER', `There is no user #${id}. Pick someone else in "Signed in as".`);
  req.user = rows[0];
  next();
}

// Onboarding gate: the app is unusable until you belong to a group.
// If the active group was cleared (e.g. you left it), fall back to your oldest group.
export async function requireGroup(req, res, next) {
  if (!req.user.active_group_id) {
    const { rows } = await query(
      `UPDATE users SET active_group_id = (
         SELECT group_id FROM group_memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1)
       WHERE id = $1 RETURNING active_group_id`,
      [req.user.id],
    );
    req.user.active_group_id = rows[0].active_group_id;
  }
  if (!req.user.active_group_id) {
    throw forbidden('NO_GROUP', 'You need a friend group to use aura. Create one or join one with an invite code.');
  }
  next();
}

// Find and Messages always act as the active group. Returns that group's id,
// rejecting any other group id the client sends.
export function actingGroupId(req, requested) {
  const active = req.user.active_group_id;
  if (requested !== undefined && parseId(requested, 'groupId') !== active) {
    throw forbidden('NOT_ACTIVE_GROUP', 'Switch to this group first. Find and Messages act as your active group.');
  }
  return active;
}
