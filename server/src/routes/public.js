// Routes that work before anyone is "signed in": the user picker, sign-up and the interest list.
import { Router } from 'express';
import { query } from '../db.js';
import { randomPastel, userInitials } from '../lib/format.js';
import { readText } from '../lib/validate.js';

const router = Router();

router.get('/users', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_color, g.name AS active_group_name
     FROM users u LEFT JOIN friend_groups g ON g.id = u.active_group_id
     ORDER BY u.id`,
  );
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      initials: userInitials(u.first_name, u.last_name),
      avatarColor: u.avatar_color,
      activeGroupName: u.active_group_name,
    })),
  });
});

// Sign up: just the basics. The rest of the profile is filled in with PATCH /api/me.
router.post('/users', async (req, res) => {
  const firstName = readText(req.body.firstName, 'First name', { max: 50, required: true });
  const lastName = readText(req.body.lastName, 'Last name', { max: 50, required: true });
  const city = readText(req.body.city, 'City', { max: 80, required: true });
  const { rows: [u] } = await query(
    `INSERT INTO users (first_name, last_name, city, avatar_color) VALUES ($1, $2, $3, $4)
     RETURNING id, first_name, last_name, avatar_color`,
    [firstName, lastName, city, randomPastel()],
  );
  res.status(201).json({
    user: {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      initials: userInitials(u.first_name, u.last_name),
      avatarColor: u.avatar_color,
      activeGroupName: null,
    },
  });
});

router.get('/interests', async (req, res) => {
  const { rows } = await query('SELECT id, name FROM interests ORDER BY name');
  res.json({ interests: rows });
});

export default router;
