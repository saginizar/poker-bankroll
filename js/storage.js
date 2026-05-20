// ── localStorage keys ─────────────────────────────────────────────
const KEYS = {
  players: 'pbm_players',
  sessions: 'pbm_sessions',
  logs: 'pbm_logs',
  auth: 'pbm_auth',       // { adminPin, scorePin }
  session: 'pbm_current', // active session id
};

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── ID generator ─────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Auth ──────────────────────────────────────────────────────────
const Auth = {
  get() { return load(KEYS.auth) || { adminPin: '1234', scorePin: '0000' }; },
  save(data) { save(KEYS.auth, data); },
  checkAdmin(pin) { return pin === this.get().adminPin; },
  checkScorer(pin) {
    const a = this.get();
    return pin === a.adminPin || pin === a.scorePin;
  },
  isSetup() { return !!load(KEYS.auth); },
};

// ── Players ──────────────────────────────────────────────────────
const Players = {
  all() { return load(KEYS.players) || []; },
  _save(list) { save(KEYS.players, list); },

  add(name) {
    const list = this.all();
    name = name.trim();
    if (!name) throw new Error('Name is required');
    if (list.find(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Player already exists');
    const p = { id: uid(), name, status: 'Active', lifetime_value: 0, running_balance: 0 };
    list.push(p);
    this._save(list);
    return p;
  },

  setStatus(id, status) {
    const list = this.all();
    const p = list.find(x => x.id === id);
    if (!p) throw new Error('Player not found');
    p.status = status;
    this._save(list);
    return p;
  },

  get(id) { return this.all().find(p => p.id === id) || null; },

  update(id, fields) {
    const list = this.all();
    const idx = list.findIndex(p => p.id === id);
    if (idx < 0) throw new Error('Player not found');
    Object.assign(list[idx], fields);
    this._save(list);
    return list[idx];
  },

  active() { return this.all().filter(p => p.status === 'Active'); },
};

// ── Sessions ─────────────────────────────────────────────────────
const Sessions = {
  all() { return load(KEYS.sessions) || []; },
  _save(list) { save(KEYS.sessions, list); },

  active() {
    const id = load(KEYS.session);
    if (!id) return null;
    return this.all().find(s => s.id === id && s.status === 'active') || null;
  },

  get(id) { return this.all().find(s => s.id === id) || null; },

  start({ title, starting_bank_cash, player_ids, expense_credits }) {
    if (this.active()) throw new Error('A session is already active');
    if (!title?.trim()) throw new Error('Title is required');
    if (!Array.isArray(player_ids) || player_ids.length < 2 || player_ids.length > 9)
      throw new Error('Select between 2 and 9 players');

    const expMap = expense_credits || {};
    let totalExpenses = 0;
    const sessionPlayers = player_ids.map(pid => {
      const player = Players.get(pid);
      if (!player) throw new Error(`Player ${pid} not found`);
      const expCredit = parseInt(expMap[pid] || 0);
      totalExpenses += expCredit;
      return {
        player_id: pid,
        name: player.name,
        initial_balance_at_start: player.running_balance,
        expense_credit: expCredit,
        cash_buy_ins: 0,
        debt_buy_ins: 0,
        final_chip_count: 0,
        game_net_outcome: 0,
        final_payout_or_debt: 0,
        settled: null, // null=pending, true=cash, false=carry
      };
    });

    const session = {
      id: uid(),
      title: title.trim(),
      start_time: new Date().toISOString(),
      end_time: null,
      starting_bank_cash: parseInt(starting_bank_cash) || 0,
      total_expenses: totalExpenses,
      status: 'active',
      players: sessionPlayers,
    };

    const list = this.all();
    list.push(session);
    this._save(list);
    save(KEYS.session, session.id);

    Logs.add(session.id, 'Session-Start', null, `Session "${session.title}" started`);
    return session;
  },

  _updateSession(id, fn) {
    const list = this.all();
    const idx = list.findIndex(s => s.id === id);
    if (idx < 0) throw new Error('Session not found');
    fn(list[idx]);
    this._save(list);
    return list[idx];
  },

  buyin(sessionId, playerId, amount, isDebt) {
    amount = parseInt(amount);
    if (!amount || amount <= 0) throw new Error('Amount must be positive');
    return this._updateSession(sessionId, s => {
      const sp = s.players.find(p => p.player_id === playerId);
      if (!sp) throw new Error('Player not in session');
      if (isDebt) sp.debt_buy_ins += amount;
      else sp.cash_buy_ins += amount;
    });
  },

  creditAdjust(sessionId, playerId, amount, notes) {
    amount = parseInt(amount);
    if (!amount) throw new Error('Amount required');
    if (!notes?.trim()) throw new Error('Notes are required');
    return this._updateSession(sessionId, s => {
      const sp = s.players.find(p => p.player_id === playerId);
      if (!sp) throw new Error('Player not in session');
      sp.expense_credit += amount;
    });
  },

  settle(sessionId, chip_counts) {
    const session = this.get(sessionId);
    if (!session || session.status !== 'active') throw new Error('Active session not found');

    const results = [];
    this._updateSession(sessionId, s => {
      s.status = 'ended';
      s.end_time = new Date().toISOString();

      for (const sp of s.players) {
        const finalChips = parseInt(chip_counts[sp.player_id] ?? 0);
        const totalInvestment = sp.cash_buy_ins + sp.debt_buy_ins;
        const pnet = finalChips - totalInvestment;
        const tax = pnet > 0 ? Math.round(pnet * 0.05) : 0;
        const gameNetOutcome = finalChips - totalInvestment - tax;
        const finalSettlement = gameNetOutcome + sp.expense_credit + sp.initial_balance_at_start;

        sp.final_chip_count = finalChips;
        sp.game_net_outcome = gameNetOutcome;
        sp.final_payout_or_debt = finalSettlement;

        // Update player lifetime_value immediately
        Players.update(sp.player_id, {
          lifetime_value: Players.get(sp.player_id).lifetime_value + gameNetOutcome
        });

        results.push({ ...sp, total_investment: totalInvestment, pnet, tax, final_settlement: finalSettlement });
      }
    });

    save(KEYS.session, null);
    Logs.add(sessionId, 'Session-End', null, `Session "${session.title}" ended`);
    return results;
  },

  confirmSettlement(sessionId, playerId, settledInCash) {
    const sp = this.get(sessionId)?.players?.find(p => p.player_id === playerId);
    if (!sp) throw new Error('Player not in session');

    const newBalance = settledInCash ? 0 : sp.final_payout_or_debt;
    Players.update(playerId, { running_balance: newBalance });

    this._updateSession(sessionId, s => {
      const p = s.players.find(x => x.player_id === playerId);
      if (p) p.settled = settledInCash;
    });

    return newBalance;
  },

  delete(sessionId, reason, adminPin) {
    if (!Auth.checkAdmin(adminPin)) throw new Error('Invalid admin PIN');
    const session = this.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (!reason?.trim()) throw new Error('Reason required');

    // Rollback each player
    for (const sp of session.players) {
      const player = Players.get(sp.player_id);
      if (!player) continue;
      Players.update(sp.player_id, {
        running_balance: sp.initial_balance_at_start,
        lifetime_value: player.lifetime_value - sp.game_net_outcome,
      });
    }

    Logs.add(sessionId, 'SESSION_DELETED', null,
      `Session "${session.title}" deleted by Admin. Reason: ${reason.trim()}`);

    const list = this.all().filter(s => s.id !== sessionId);
    this._save(list);

    if (load(KEYS.session) === sessionId) save(KEYS.session, null);
  },
};

// ── Logs ─────────────────────────────────────────────────────────
const Logs = {
  all() { return load(KEYS.logs) || []; },
  add(sessionId, action_type, amount, notes) {
    const list = this.all();
    list.unshift({ id: uid(), session_id: sessionId, timestamp: new Date().toISOString(), action_type, amount, notes });
    if (list.length > 500) list.splice(500);
    save(KEYS.logs, list);
  },
};

// ── ApiKey ───────────────────────────────────────────────────────
const ApiKey = {
  get() { return localStorage.getItem('pbm_api_key') || null; },
  save(key) { localStorage.setItem('pbm_api_key', key.trim()); },
  clear() { localStorage.removeItem('pbm_api_key'); },
};
