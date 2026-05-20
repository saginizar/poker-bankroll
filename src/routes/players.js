const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { init } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await init();
    res.json(db.all('SELECT * FROM players ORDER BY name'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const trimmed = name.trim();
    if (db.get('SELECT id FROM players WHERE name = ?', [trimmed])) {
      return res.status(409).json({ error: 'Player name already exists' });
    }
    const id = uuidv4();
    db.run('INSERT INTO players (id, name) VALUES (?, ?)', [id, trimmed]);
    res.status(201).json(db.get('SELECT * FROM players WHERE id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!db.get('SELECT id FROM players WHERE id = ?', [req.params.id])) {
      return res.status(404).json({ error: 'Player not found' });
    }
    db.run('UPDATE players SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json(db.get('SELECT * FROM players WHERE id = ?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
