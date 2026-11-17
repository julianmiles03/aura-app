// Routes that work before signing in.
import { Router } from 'express';
import { query } from '../db.js';
import { PICKER_THRESHOLD } from '../lib/interests.js';

const router = Router();

// The interest picker: the starter interests, the ones an admin added, and custom ones that 10 or
// more people have (lib/interests.js). A custom interest below that is only on its owners' profiles.
// pickerThreshold is that number, for the picker's hint.
router.get('/interests', async (req, res) => {
  const { rows } = await query('SELECT id, name FROM interests WHERE in_picker ORDER BY lower(name), id');
  res.json({ interests: rows, pickerThreshold: PICKER_THRESHOLD });
});

export default router;
