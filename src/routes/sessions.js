const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { init } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function getSessionWithPlayers(db, sessionId) {
  const session = db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return null;
  const players = db.all(`
    SELECT sp.*, p.name FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    WHERE sp.session_id = ?`, [sessionId]);
  return { ...session, players };
}

// GET all sessions
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const sessions = db.all('SELECT * FROM sessions ORDER BY start_time DESC');
    res.json(sessions.map(s => {
      const players = db.all(`SELECT sp.*, p.name FROM session_players sp JOIN players p ON p.id = sp.player_id WHERE sp.session_id = ?`, [s.id]);
      return { ...s, players };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET active session
router.get('/active', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const session = db.get("SELECT * FROM sessions WHERE status = 'active' LIMIT 1");
    if (!session) return res.json(null);
    res.json(getSessionWithPlayers(db, session.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST start session
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = await init();
    if (db.get("SELECT id FROM sessions WHERE status = 'active'")) {
      return res.status(409).json({ error: 'A session is already active' });
    }
    const { title, starting_bank_cash, player_ids, expense_credits } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!Array.isArray(player_ids) || player_ids.length < 2 || player_ids.length > 9) {
      return res.status(400).json({ error: 'Select between 2 and 9 players' });
    }

    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const bankCash = parseInt(starting_bank_cash) || 0;
    const expMap = expense_credits || {};
    let totalExpenses = 0;
    for (const pid of player_ids) totalExpenses += parseInt(expMap[pid] || 0);

    db.transaction(() => {
      db.run('INSERT INTO sessions (id, title, start_time, starting_bank_cash, total_expenses, status) VALUES (?,?,?,?,?,?)',
        [sessionId, title.trim(), now, bankCash, totalExpenses, 'active']);

      for (const pid of player_ids) {
        const player = db.get('SELECT * FROM players WHERE id = ?', [pid]);
        if (!player) continue;
        db.run('INSERT INTO session_players (session_id, player_id, initial_balance_at_start, expense_credit) VALUES (?,?,?,?)',
          [sessionId, pid, player.running_balance, parseInt(expMap[pid] || 0)]);
      }

      db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, notes) VALUES (?,?,?,?,?,?)',
        [uuidv4(), sessionId, req.user.id, now, 'Session-Start', `Session "${title.trim()}" started`]);
    });

    res.status(201).json(getSessionWithPlayers(db, sessionId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST buy-in
router.post('/:sessionId/buyin', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { sessionId } = req.params;
    const { player_id, amount, is_debt } = req.body;
    const amt = parseInt(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    if (!db.get("SELECT id FROM sessions WHERE id = ? AND status = 'active'", [sessionId])) {
      return res.status(404).json({ error: 'Active session not found' });
    }
    if (!db.get('SELECT player_id FROM session_players WHERE session_id = ? AND player_id = ?', [sessionId, player_id])) {
      return res.status(404).json({ error: 'Player not in session' });
    }

    if (is_debt) {
      db.run('UPDATE session_players SET debt_buy_ins = debt_buy_ins + ? WHERE session_id = ? AND player_id = ?', [amt, sessionId, player_id]);
      db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, amount) VALUES (?,?,?,?,?,?)',
        [uuidv4(), sessionId, req.user.id, new Date().toISOString(), 'Debt-Buy-in', amt]);
    } else {
      db.run('UPDATE session_players SET cash_buy_ins = cash_buy_ins + ? WHERE session_id = ? AND player_id = ?', [amt, sessionId, player_id]);
      db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, amount) VALUES (?,?,?,?,?,?)',
        [uuidv4(), sessionId, req.user.id, new Date().toISOString(), 'Buy-in', amt]);
    }

    res.json(db.get('SELECT sp.*, p.name FROM session_players sp JOIN players p ON p.id = sp.player_id WHERE sp.session_id = ? AND sp.player_id = ?', [sessionId, player_id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST credit adjustment
router.post('/:sessionId/credit', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { sessionId } = req.params;
    const { player_id, amount, notes } = req.body;
    const amt = parseInt(amount);
    if (!amt) return res.status(400).json({ error: 'Amount required' });
    if (!notes?.trim()) return res.status(400).json({ error: 'Notes are required for credit adjustments' });

    if (!db.get("SELECT id FROM sessions WHERE id = ? AND status = 'active'", [sessionId])) {
      return res.status(404).json({ error: 'Active session not found' });
    }
    if (!db.get('SELECT player_id FROM session_players WHERE session_id = ? AND player_id = ?', [sessionId, player_id])) {
      return res.status(404).json({ error: 'Player not in session' });
    }

    db.run('UPDATE session_players SET expense_credit = expense_credit + ? WHERE session_id = ? AND player_id = ?', [amt, sessionId, player_id]);
    db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, amount, notes) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(), sessionId, req.user.id, new Date().toISOString(), 'Credit-Adjustment', amt, notes.trim()]);

    res.json(db.get('SELECT sp.*, p.name FROM session_players sp JOIN players p ON p.id = sp.player_id WHERE sp.session_id = ? AND sp.player_id = ?', [sessionId, player_id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST settle (end game)
router.post('/:sessionId/settle', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { sessionId } = req.params;
    const { chip_counts } = req.body;

    const session = db.get("SELECT * FROM sessions WHERE id = ? AND status = 'active'", [sessionId]);
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    const players = db.all('SELECT sp.*, p.name FROM session_players sp JOIN players p ON p.id = sp.player_id WHERE sp.session_id = ?', [sessionId]);
    if (!chip_counts || Object.keys(chip_counts).length !== players.length) {
      return res.status(400).json({ error: 'Chip counts required for all players' });
    }

    const now = new Date().toISOString();
    const results = [];

    db.transaction(() => {
      db.run("UPDATE sessions SET end_time = ?, status = 'ended' WHERE id = ?", [now, sessionId]);

      for (const sp of players) {
        const finalChips = parseInt(chip_counts[sp.player_id] || 0);
        const totalInvestment = sp.cash_buy_ins + sp.debt_buy_ins;
        const pnet = finalChips - totalInvestment;
        const tax = pnet > 0 ? Math.round(pnet * 0.05) : 0;
        const gameNetOutcome = finalChips - totalInvestment - tax;
        const finalSettlement = gameNetOutcome + sp.expense_credit + sp.initial_balance_at_start;

        db.run('UPDATE session_players SET final_chip_count=?, game_net_outcome=?, final_payout_or_debt=? WHERE session_id=? AND player_id=?',
          [finalChips, gameNetOutcome, finalSettlement, sessionId, sp.player_id]);

        db.run('UPDATE players SET lifetime_value = lifetime_value + ? WHERE id = ?', [gameNetOutcome, sp.player_id]);

        db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, amount) VALUES (?,?,?,?,?,?)',
          [uuidv4(), sessionId, req.user.id, now, 'Chip-Count', finalChips]);

        results.push({
          player_id: sp.player_id,
          name: sp.name,
          final_chips: finalChips,
          total_investment: totalInvestment,
          pnet,
          tax,
          game_net_outcome: gameNetOutcome,
          expense_credit: sp.expense_credit,
          initial_balance: sp.initial_balance_at_start,
          final_settlement: finalSettlement
        });
      }

      db.run('INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, notes) VALUES (?,?,?,?,?,?)',
        [uuidv4(), sessionId, req.user.id, now, 'Session-End', `Session "${session.title}" ended`]);
    });

    res.json({ sessionId, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST confirm settlement (cash or carry)
router.post('/:sessionId/confirm-settlement', requireAuth, async (req, res) => {
  try {
    const db = await init();
    const { sessionId } = req.params;
    const { player_id, settled_in_cash } = req.body;

    const session = db.get("SELECT * FROM sessions WHERE id = ? AND status = 'ended'", [sessionId]);
    if (!session) return res.status(404).json({ error: 'Ended session not found' });

    const sp = db.get('SELECT * FROM session_players WHERE session_id = ? AND player_id = ?', [sessionId, player_id]);
    if (!sp) return res.status(404).json({ error: 'Player not in session' });

    const newBalance = settled_in_cash ? 0 : sp.final_payout_or_debt;
    db.run('UPDATE players SET running_balance = ? WHERE id = ?', [newBalance, player_id]);

    res.json({ player_id, running_balance: newBalance, settled_in_cash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE session (admin rollback)
router.delete('/:sessionId', requireAdmin, async (req, res) => {
  try {
    const db = await init();
    const { sessionId } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Deletion reason required' });

    const session = db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const players = db.all('SELECT * FROM session_players WHERE session_id = ?', [sessionId]);

    db.transaction(() => {
      for (const sp of players) {
        db.run('UPDATE players SET running_balance = ?, lifetime_value = lifetime_value - ? WHERE id = ?',
          [sp.initial_balance_at_start, sp.game_net_outcome, sp.player_id]);
      }

      db.run(`INSERT INTO action_log (id, session_id, user_id, timestamp, action_type, amount, notes) VALUES (?,?,?,?,'SESSION_DELETED',NULL,?)`,
        [uuidv4(), sessionId, req.user.id, new Date().toISOString(),
         `Session entitled "${session.title}" deleted by Admin. Reason: ${reason.trim()}`]);

      // Delete session_players first, then session
      db.run('DELETE FROM session_players WHERE session_id = ?', [sessionId]);
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    });

    res.json({ message: 'Session deleted and profiles rolled back' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
