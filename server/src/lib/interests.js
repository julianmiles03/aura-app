// The interests on people's profiles (user_interests), and which ones the interest picker offers.
//
// The picker (GET /api/interests) shows the interests with interests.in_picker set: the starter ones,
// the ones an admin added, and custom ones that have caught on. A name someone types that isn't an
// interest yet becomes a custom interest: it goes on their profile at once (and on the profile of
// anyone else who types the same name), but nobody else is offered it until PICKER_THRESHOLD people
// have it. Then it joins the picker for good.
//
// Names match without regard to case or spacing: "Rock Climbing" and " rock  climbing" are the same
// interest. Names are stored tidy (the interests_name_tidy check) and compared with lower(name) (the
// interests_name_lower_idx unique index).
import { badRequest } from '../errors.js';

export const PICKER_THRESHOLD = 10;
export const INTEREST_NAME_MAX = 40; // interests.name is varchar(40)
const MAX_PER_PERSON = 15;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g; // tabs, newlines and junk from a bad paste
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

// What gets stored and compared: control characters become spaces, zero-width ones go, every run of
// spaces (non-breaking ones too) becomes one space, and the ends are trimmed.
export function tidyInterestName(text) {
  return text.replace(CONTROL_CHARS, ' ').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

// One interest name, tidied, or a 400 VALIDATION_ERROR saying what's wrong with it. Length is counted
// like Postgres counts varchar, so an emoji is one character.
export function readInterestName(value, field = 'Interest') {
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} must be text.`);
  const name = tidyInterestName(value);
  if (!name) throw badRequest('VALIDATION_ERROR', `${field} can't be empty.`);
  if ([...name].length > INTEREST_NAME_MAX) {
    throw badRequest('VALIDATION_ERROR', `${field} must be ${INTEREST_NAME_MAX} characters or fewer.`);
  }
  return name;
}

// PATCH /me's `interests`: the person's whole list, 1 to 15 names. Names that only differ in case or
// spacing count once (the first one is kept). Undefined when the field wasn't sent.
export function readInterestNames(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', 'Interests must be a list.');
  const names = new Map();
  for (const raw of value) {
    const name = readInterestName(raw, 'Interests');
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  if (names.size < 1) throw badRequest('VALIDATION_ERROR', 'Add at least one interest.');
  if (names.size > MAX_PER_PERSON) throw badRequest('VALIDATION_ERROR', `You can have up to ${MAX_PER_PERSON} interests.`);
  return [...names.values()];
}

// Sets a person's interests to exactly `names` (from readInterestNames), inside the caller's
// transaction. A name that matches an interest in any case or spacing reuses it, picker or not; a new
// name becomes a custom interest. Any custom one that's now on PICKER_THRESHOLD or more profiles
// joins the picker.
export async function replaceInterests(client, userId, names) {
  // ON CONFLICT DO UPDATE locks each interest's row until COMMIT, so two people adding the same
  // interest at once take turns, and the second one's count below includes the first. The rows are
  // locked in name order, the same in every save, so two saves can't each hold a row the other needs
  // (a deadlock).
  const idByName = new Map();
  for (const name of [...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))) {
    const { rows: [row] } = await client.query(
      `INSERT INTO interests (name, in_picker) VALUES ($1, false)
       ON CONFLICT ((lower(name))) DO UPDATE SET name = interests.name
       RETURNING id`,
      [name],
    );
    idByName.set(name, row.id);
  }
  const ids = names.map((name) => idByName.get(name)); // back in the person's order, for added_at
  await client.query('DELETE FROM user_interests WHERE user_id = $1 AND NOT (interest_id = ANY($2))', [userId, ids]);
  // Existing interests keep their original added_at (so "top 2" stays stable); new ones go last, in order.
  await client.query(
    `INSERT INTO user_interests (user_id, interest_id, added_at)
     SELECT $1, t.id, clock_timestamp() + t.ord * interval '1 millisecond'
     FROM unnest($2::bigint[]) WITH ORDINALITY AS t(id, ord)
     ON CONFLICT (user_id, interest_id) DO NOTHING`,
    [userId, ids],
  );
  await client.query(
    `UPDATE interests i SET in_picker = true
     WHERE i.id = ANY($1) AND NOT i.in_picker
       AND (SELECT count(*) FROM user_interests ui WHERE ui.interest_id = i.id) >= $2`,
    [ids, PICKER_THRESHOLD],
  );
}
