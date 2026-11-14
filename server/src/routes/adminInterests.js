// Maintain Interests, in the admin portal: create, list, rename and delete rows in `interests`.
// routes/admin.js mounts this router after requireAdminSession, so every route here needs a signed-in
// admin (401 ADMIN_SIGNED_OUT otherwise).
//
// Interests are shared: people pick them on their profile (user_interests), and a group's interests
// are the union of its members' (the group_shared_interests view). So a rename shows up everywhere at
// once, and a delete takes the interest off every profile that has it (ON DELETE CASCADE).
// Names are unique without regard to case ("hiking" and "Hiking" are the same interest), like the
// database's interests_name_lower_idx.
import { Router } from 'express';
import { query } from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { parseId, readText } from '../lib/validate.js';

const router = Router();

const interestNotFound = () => notFound('INTEREST_NOT_FOUND', "That interest doesn't exist (it may have been deleted).");

// The name, checked like the app checks a new interest: 1 to 40 characters once trimmed. Errors use
// the same shape as Maintain Users: 400 VALIDATION_ERROR with details.fields.name.
function readName(body) {
  try {
    return readText(body.name, 'Name', { max: 40, required: true });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    throw new ApiError(400, 'VALIDATION_ERROR', err.message, { fields: { name: err.message } });
  }
}

// 409 INTEREST_EXISTS when another interest already has this name in any capitalization.
async function assertNameFree(name, exceptId = null) {
  const { rows: [taken] } = await query(
    'SELECT name FROM interests WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2',
    [name, exceptId],
  );
  if (taken) throw duplicate(taken.name);
}
const duplicate = (existing) => {
  const message = `There's already an interest called “${existing}”.`;
  return conflict('INTEREST_EXISTS', message, { fields: { name: message } });
};

// Each interest with how widely it's used: how many people picked it, how many groups show it, and
// how many people have it as their only interest (the app asks those people to add another one if
// it's deleted, because a profile needs at least one interest).
const SELECT_INTERESTS = `
  SELECT i.id, i.name,
         (SELECT count(*) FROM user_interests ui WHERE ui.interest_id = i.id) AS user_count,
         (SELECT count(*) FROM group_shared_interests s WHERE s.interest_id = i.id) AS group_count,
         (SELECT count(*) FROM user_interests ui
           WHERE ui.interest_id = i.id
             AND NOT EXISTS (SELECT 1 FROM user_interests o WHERE o.user_id = ui.user_id AND o.interest_id <> i.id)) AS only_interest_count
  FROM interests i`;
const interestJson = (i) => ({
  id: i.id,
  name: i.name,
  userCount: i.user_count,
  groupCount: i.group_count,
  onlyInterestCount: i.only_interest_count,
});
async function loadInterest(id) {
  const { rows: [row] } = await query(`${SELECT_INTERESTS} WHERE i.id = $1`, [id]);
  if (!row) throw interestNotFound();
  return interestJson(row);
}

// Every interest, A to Z: { interests: [...] }.
router.get('/admin/interests', async (req, res) => {
  const { rows } = await query(`${SELECT_INTERESTS} ORDER BY lower(i.name), i.id`);
  res.json({ interests: rows.map(interestJson) });
});

// Create: { name } -> 201 { interest }.
router.post('/admin/interests', async (req, res) => {
  const name = readName(req.body);
  await assertNameFree(name);
  try {
    const { rows: [row] } = await query('INSERT INTO interests (name) VALUES ($1) RETURNING id', [name]);
    res.status(201).json({ interest: await loadInterest(row.id) });
  } catch (err) {
    // Someone added the same name a moment ago: the unique index catches it.
    if (err.code === '23505') throw duplicate(name);
    throw err;
  }
});

// Rename: { name } -> { interest }. Changing only the capitalization ("hiking" -> "Hiking") is fine.
router.patch('/admin/interests/:id', async (req, res) => {
  const id = parseId(req.params.id, 'interest id');
  const name = readName(req.body);
  await assertNameFree(name, id);
  try {
    const { rowCount } = await query('UPDATE interests SET name = $2 WHERE id = $1', [id, name]);
    if (!rowCount) throw interestNotFound();
  } catch (err) {
    if (err.code === '23505') throw duplicate(name);
    throw err;
  }
  res.json({ interest: await loadInterest(id) });
});

// Delete: it comes off every profile that has it (user_interests rows cascade), and so out of every
// group's shared interests too.
router.delete('/admin/interests/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM interests WHERE id = $1', [parseId(req.params.id, 'interest id')]);
  if (!rowCount) throw interestNotFound();
  res.sendStatus(204);
});

export default router;
