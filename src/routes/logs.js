const express = require('express');
const { init } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const logs = db.all(`
      SELECT al.*, u.username FROM action_log al
      JOIN users u ON u.id = al.user_id
      ORDER BY al.timestamp DESC
      LIMIT 200
    `);
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
