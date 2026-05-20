// ── App State ────────────────────────────────────────────────────
const state = {
  view: 'roster',
  role: null,          // 'admin' | 'scorer' | null
  tallyResults: null,
  selectedPlayer: null,
  amaMessages: [],     // { role: 'user'|'assistant', content: string }[]
};

// ── Boot ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isSetup()) {
    renderPinSetup();
  } else {
    renderPinLogin();
  }
});

// ── PIN Setup (first run) ─────────────────────────────────────────
function renderPinSetup() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-icon">♠</div>
        <div class="login-title">Poker Bankroll</div>
        <div class="login-subtitle">First-time setup — set your PINs</div>
        <label class="input-label mt-md">Admin PIN (4 digits)</label>
        <input id="setup-admin" type="tel" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="e.g. 1234" class="input-field pin-input mb-md" autocomplete="off">
        <label class="input-label">Scorer PIN (4 digits)</label>
        <input id="setup-score" type="tel" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="e.g. 0000" class="input-field pin-input" autocomplete="off">
        <button class="btn-primary full-width mt-md" onclick="doSetup()">Save &amp; Enter</button>
        <div id="setup-err" class="login-error"></div>
      </div>
    </div>`;
}

function doSetup() {
  const adminPin = document.getElementById('setup-admin').value.trim();
  const scorePin = document.getElementById('setup-score').value.trim();
  if (adminPin.length !== 4 || !/^\d{4}$/.test(adminPin)) {
    document.getElementById('setup-err').textContent = 'Admin PIN must be exactly 4 digits'; return;
  }
  if (scorePin.length !== 4 || !/^\d{4}$/.test(scorePin)) {
    document.getElementById('setup-err').textContent = 'Scorer PIN must be exactly 4 digits'; return;
  }
  Auth.save({ adminPin, scorePin });
  state.role = 'admin';
  loadAndRender('roster');
}

// ── PIN Login ─────────────────────────────────────────────────────
function renderPinLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-icon">♠</div>
        <div class="login-title">Poker Bankroll</div>
        <div class="login-subtitle">Enter your PIN</div>
        <input id="l-pin" type="tel" maxlength="4" pattern="[0-9]*" inputmode="numeric"
          placeholder="••••" class="input-field pin-input mt-md" autocomplete="off"
          onkeydown="if(event.key==='Enter') doLogin()">
        <button class="btn-primary full-width mt-md" onclick="doLogin()">Enter</button>
        <div id="login-err" class="login-error"></div>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('l-pin')?.focus(), 100);
}

function doLogin() {
  const pin = document.getElementById('l-pin').value.trim();
  if (Auth.checkAdmin(pin)) {
    state.role = 'admin';
    loadAndRender('roster');
  } else if (Auth.checkScorer(pin)) {
    state.role = 'scorer';
    loadAndRender('roster');
  } else {
    document.getElementById('login-err').textContent = 'Incorrect PIN';
    document.getElementById('l-pin').value = '';
  }
}

function doLogout() {
  state.role = null;
  state.tallyResults = null;
  renderPinLogin();
}

// ── Navigation ────────────────────────────────────────────────────
function loadAndRender(view) {
  state.view = view;
  if (view !== 'tally') state.tallyResults = null;
  render();
}

function navigate(view) { loadAndRender(view); }

function render() {
  const app = document.getElementById('app');
  const hasActive = !!Sessions.active();
  const isAMA = state.view === 'ama';
  let html = buildTopNav() + `<div class="page${isAMA ? ' page-ama' : ''}">`;
  switch (state.view) {
    case 'roster':  html += buildRosterView(); break;
    case 'session': html += hasActive ? buildGameBoard() : buildNewSession(); break;
    case 'tally':   html += buildTallyView(); break;
    case 'history': html += buildHistoryView(); break;
    case 'logs':    html += buildLogsView(); break;
    case 'ama':     html += buildAMAView(); break;
  }
  html += '</div>' + buildBottomNav();
  app.innerHTML = html;
  if (isAMA) scrollAMAToBottom();
}

function buildTopNav() {
  const isAdmin = state.role === 'admin';
  const fbCount = isAdmin ? Feedback.all().length : 0;
  const fbBadge = fbCount > 0 ? `<span class="topnav-fb-badge">${fbCount}</span>` : '';
  return `<div class="topnav">
    <span class="topnav-title">♠ Poker Bankroll ${isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</span>
    ${isAdmin ? `<button class="btn-icon topnav-fb-btn" onclick="openFeedback()" title="Feedback">💬${fbBadge}</button>` : ''}
    <button class="btn-icon" onclick="doLogout()" title="Logout">⏻</button>
  </div>`;
}

function buildBottomNav() {
  const v = state.view;
  const hasActive = !!Sessions.active();
  const isAdmin = state.role === 'admin';
  return `<nav class="bottomnav">
    <a onclick="navigate('roster')" class="${v==='roster'?'active':''}">
      <span class="nav-icon">👥</span>Roster
    </a>
    <a onclick="navigate('session')" class="${(v==='session'||v==='tally')?'active':''}">
      <span class="nav-icon">${hasActive ? '🎮' : '🃏'}</span>${hasActive ? 'Live' : 'New Game'}
    </a>
    <a onclick="navigate('history')" class="${v==='history'?'active':''}">
      <span class="nav-icon">📋</span>History
    </a>
    <a onclick="navigate('logs')" class="${v==='logs'?'active':''}">
      <span class="nav-icon">📜</span>Audit
    </a>
    ${isAdmin ? `<a onclick="navigate('ama')" class="${v==='ama'?'active':''}">
      <span class="nav-icon">🤖</span>Ask AI
    </a>` : ''}
  </nav>`;
}

// ── Roster ────────────────────────────────────────────────────────
function buildRosterView() {
  const players = Players.all();
  let rows = players.map(p => `
    <div class="player-row">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div class="player-info">
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-stats">
          Balance: <span class="${balClass(p.running_balance)}">${fmtBalance(p.running_balance)}</span>
          &nbsp;|&nbsp; Lifetime: <span class="${balClass(p.lifetime_value)}">${fmtILS(p.lifetime_value)}</span>
        </div>
      </div>
      <div class="col" style="align-items:flex-end;gap:4px">
        <span class="status-badge ${p.status==='Active'?'status-active':'status-inactive'}">${p.status}</span>
        <button class="toggle-btn" onclick="toggleStatus('${p.id}','${p.status}')">${p.status==='Active'?'Deactivate':'Activate'}</button>
      </div>
    </div>`).join('');
  if (!rows) rows = '<div class="empty-state"><div class="empty-icon">👤</div><div>No players yet — add one below</div></div>';
  return `
    <h2 class="mb-md">Player Roster</h2>
    <div class="card">
      <div class="row gap-sm">
        <input id="new-player-name" type="text" placeholder="New player name" class="input-field" style="flex:1"
          autocapitalize="words" onkeydown="if(event.key==='Enter')addPlayer()">
        <button class="btn-primary btn-sm" onclick="addPlayer()">Add</button>
      </div>
    </div>
    <div class="card">${rows}</div>`;
}

function addPlayer() {
  const inp = document.getElementById('new-player-name');
  try {
    const p = Players.add(inp.value);
    inp.value = '';
    render();
    showToast(`${p.name} added`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function toggleStatus(id, current) {
  try {
    Players.setStatus(id, current === 'Active' ? 'Inactive' : 'Active');
    render();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── New Session ───────────────────────────────────────────────────
function buildNewSession() {
  const active = Players.active();
  const rows = active.map(p => `
    <div class="player-select-row">
      <input type="checkbox" id="sel-${p.id}" value="${p.id}" onchange="updateSelCount()"
        style="width:18px;height:18px;accent-color:var(--gold)">
      <label for="sel-${p.id}" style="flex:1;cursor:pointer;font-weight:600">${esc(p.name)}</label>
      <span class="text-dim" style="font-size:.75rem;margin-right:4px">🛒</span>
      <input type="number" min="0" step="1" placeholder="₪0" class="expense-input" id="exp-${p.id}" inputmode="numeric">
    </div>`).join('');
  return `
    <h2 class="mb-md">New Session</h2>
    <div class="card">
      <div class="input-row">
        <label class="input-label">Session Title</label>
        <input id="session-title" type="text" placeholder="e.g. Friday Night Deepstack" class="input-field">
      </div>
      <div class="input-row">
        <label class="input-label">Starting Bank Cash (₪)</label>
        <input id="session-bank" type="number" min="0" step="1" placeholder="0" class="input-field" inputmode="numeric">
      </div>
    </div>
    <div class="card">
      <div class="row mb-md">
        <h3>Select Players</h3><span class="spacer"></span>
        <span class="selected-count" id="sel-count">0 / 9 selected</span>
      </div>
      <div class="text-dim mb-sm" style="font-size:.75rem">🛒 = expense credit (snacks etc.) per player</div>
      ${rows || '<div class="text-muted text-center">No active players — add some in Roster first</div>'}
    </div>
    <button class="btn-gold full-width" style="padding:14px" onclick="startSession()">Start Session ▶</button>`;
}

function updateSelCount() {
  const n = document.querySelectorAll('[id^="sel-"]:checked').length;
  const el = document.getElementById('sel-count');
  if (el) el.textContent = `${n} / 9 selected`;
}

function startSession() {
  const title = document.getElementById('session-title')?.value;
  const bank = parseInt(document.getElementById('session-bank')?.value) || 0;
  const player_ids = Array.from(document.querySelectorAll('[id^="sel-"]:checked')).map(c => c.value);
  const expense_credits = {};
  for (const pid of player_ids) {
    const v = parseInt(document.getElementById(`exp-${pid}`)?.value || 0);
    if (v > 0) expense_credits[pid] = v;
  }
  try {
    Sessions.start({ title, starting_bank_cash: bank, player_ids, expense_credits });
    loadAndRender('session');
    showToast('Session started!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Game Board ────────────────────────────────────────────────────
function buildGameBoard() {
  const s = Sessions.active();
  const players = s.players;
  const totalChips = players.reduce((a, p) => a + p.cash_buy_ins + p.debt_buy_ins + p.expense_credit, 0);
  const cashInBank = s.starting_bank_cash + players.reduce((a, p) => a + p.cash_buy_ins, 0);
  const openDebt = players.reduce((a, p) => a + p.debt_buy_ins, 0);
  const seats = ellipsePositions(players.length);

  const seatNodes = players.map((p, i) => {
    const pos = seats[i];
    const totalIn = p.cash_buy_ins + p.debt_buy_ins;
    return `<div class="seat-node" style="left:${pos.x}%;top:${pos.y}%"
        onclick="openOverlay('${p.player_id}','${esc(p.name)}')">
      <div class="seat-chip ${p.debt_buy_ins > 0 ? 'has-debt' : ''}">
        <div class="seat-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="seat-buyin">${totalIn > 0 ? '₪'+totalIn : '—'}</div>
      </div>
      <div class="seat-name">${esc(p.name)}</div>
    </div>`;
  }).join('');

  return `
    <div class="live-stats">
      <div class="stat-cell">
        <div class="stat-value text-gold">${fmtILS(totalChips)}</div>
        <div class="stat-label">Chips In Game</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-cell">
        <div class="stat-value text-green">${fmtILS(cashInBank)}</div>
        <div class="stat-label">Cash in Bank</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-cell">
        <div class="stat-value ${openDebt>0?'text-red':'text-muted'}">${fmtILS(openDebt)}</div>
        <div class="stat-label">Open Debt</div>
      </div>
    </div>
    <div class="card" style="padding:8px 12px;margin-bottom:8px">
      <div class="row">
        <span class="text-muted" style="font-size:.8rem">♠ ${esc(s.title)}</span>
        <span class="spacer"></span>
        <span class="text-dim" style="font-size:.75rem">${formatTime(s.start_time)}</span>
      </div>
    </div>
    <div class="ellipse-container">
      <div class="table-felt">
        <div class="central-monitor">
          <div class="monitor-label">Chips</div>
          <div class="monitor-value">${fmtILS(totalChips)}</div>
          <div class="monitor-label" style="margin-top:4px">Bank</div>
          <div class="monitor-value text-green">${fmtILS(cashInBank)}</div>
        </div>
      </div>
      ${seatNodes}
    </div>
    <div class="end-session-bar">
      <span style="font-size:1.2rem">🏁</span>
      <div style="flex:1">
        <div style="font-weight:700;color:var(--gold)">End Session</div>
        <div class="text-dim" style="font-size:.75rem">Enter final chip counts to settle</div>
      </div>
      <button class="btn-danger btn-sm" onclick="navigate('tally')">End Game</button>
    </div>`;
}

function ellipsePositions(n) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: parseFloat((50 + 44 * Math.cos(a)).toFixed(1)), y: parseFloat((50 + 42 * Math.sin(a)).toFixed(1)) };
  });
}

// ── Player Overlay ────────────────────────────────────────────────
function openOverlay(playerId, playerName) {
  state.selectedPlayer = { id: playerId, name: playerName };
  document.getElementById('overlay-player-name').textContent = playerName;
  document.getElementById('buyin-amount').value = '';
  document.getElementById('buyin-is-debt').checked = false;
  document.getElementById('credit-amount').value = '';
  document.getElementById('credit-notes').value = '';
  switchTab('buyin');
  document.getElementById('overlay').classList.remove('hidden');
}

function closeOverlay() {
  document.getElementById('overlay').classList.add('hidden');
  state.selectedPlayer = null;
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-buyin').classList.toggle('hidden', tab !== 'buyin');
  document.getElementById('tab-credit').classList.toggle('hidden', tab !== 'credit');
}

function addBuyin(amount) { document.getElementById('buyin-amount').value = amount; }

function submitBuyin() {
  const sid = Sessions.active()?.id;
  const { id: pid, name } = state.selectedPlayer || {};
  if (!sid || !pid) return;
  const amount = parseInt(document.getElementById('buyin-amount').value);
  const isDebt = document.getElementById('buyin-is-debt').checked;
  try {
    Sessions.buyin(sid, pid, amount, isDebt);
    Logs.add(sid, isDebt ? 'Debt-Buy-in' : 'Buy-in', amount, `${name}: ₪${amount}`);
    closeOverlay();
    render();
    showToast(`₪${amount} ${isDebt ? 'debt' : 'cash'} buy-in for ${name}`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function submitCredit() {
  const sid = Sessions.active()?.id;
  const { id: pid } = state.selectedPlayer || {};
  if (!sid || !pid) return;
  const amount = parseInt(document.getElementById('credit-amount').value);
  const notes = document.getElementById('credit-notes').value.trim();
  try {
    Sessions.creditAdjust(sid, pid, amount, notes);
    Logs.add(sid, 'Credit-Adjustment', amount, notes);
    closeOverlay();
    render();
    showToast('Adjustment applied', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tally ─────────────────────────────────────────────────────────
function buildTallyView() {
  if (state.tallyResults) return buildSettlementResults();
  const s = Sessions.active();
  if (!s) return '<div class="empty-state"><div class="empty-icon">🏁</div><div>No active session</div></div>';

  const rows = s.players.map(p => `
    <div class="tally-player">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600">${esc(p.name)}</div>
        <div class="text-dim" style="font-size:.75rem">In: ₪${p.cash_buy_ins + p.debt_buy_ins}</div>
      </div>
      <div>
        <label class="input-label" style="text-align:right;font-size:.72rem">Final chips</label>
        <input type="number" min="0" step="1" placeholder="0" class="chip-input"
          id="chips-${p.player_id}" inputmode="numeric">
      </div>
    </div>`).join('');

  return `
    <h2 class="mb-md">🏁 Final Chip Count</h2>
    <div class="card text-muted" style="font-size:.82rem;margin-bottom:8px">
      Enter each player's final chip count. 5% tax applies to winners only.
    </div>
    <div class="card">${rows}</div>
    <button class="btn-gold full-width" style="padding:14px" onclick="submitTally()">Calculate Settlement ▶</button>
    <button class="btn-secondary full-width mt-sm" onclick="navigate('session')">← Back to Game</button>`;
}

function submitTally() {
  const s = Sessions.active();
  if (!s) return;
  const chip_counts = {};
  for (const p of s.players) {
    const val = document.getElementById(`chips-${p.player_id}`)?.value;
    if (val === '' || val === null || val === undefined) {
      showToast(`Enter chip count for ${p.name}`, 'error'); return;
    }
    chip_counts[p.player_id] = parseInt(val);
  }
  try {
    const results = Sessions.settle(s.id, chip_counts);
    state.tallyResults = { sessionId: s.id, results };
    state.view = 'tally';
    render();
  } catch (e) { showToast(e.message, 'error'); }
}

function buildSettlementResults() {
  const { sessionId, results } = state.tallyResults;
  const session = Sessions.get(sessionId);

  const rows = results.map(r => {
    const fs = r.final_settlement;
    const cls = fs > 0 ? 'text-green' : fs < 0 ? 'text-red' : 'text-muted';
    const sp = session?.players?.find(p => p.player_id === r.player_id);
    const settled = sp?.settled;
    const actionBtns = (settled === null || settled === undefined)
      ? `<div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end">
          <span class="settlement-badge badge-cash" onclick="confirmSettle('${sessionId}','${r.player_id}',true)">Cash ✓</span>
          <span class="settlement-badge badge-carry" onclick="confirmSettle('${sessionId}','${r.player_id}',false)">Carry →</span>
        </div>`
      : `<div class="text-dim" style="font-size:.7rem;margin-top:2px">${settled ? '✓ Settled cash' : '→ Carried forward'}</div>`;
    return `<div class="result-row">
      <div>
        <div class="result-name">${esc(r.name)}</div>
        <div class="text-dim" style="font-size:.72rem">
          In: ₪${r.total_investment} &nbsp;|&nbsp; Chips: ₪${r.final_chips} &nbsp;|&nbsp; Tax: ₪${r.tax}
        </div>
      </div>
      <div style="text-align:right">
        <div class="result-amount ${cls}">${fs > 0 ? '+' : ''}${fmtILS(fs)}</div>
        ${actionBtns}
      </div>
    </div>`;
  }).join('');

  return `
    <h2 class="mb-md">Settlement Results</h2>
    <div class="card text-muted" style="font-size:.82rem;margin-bottom:8px">
      <strong>Cash ✓</strong> — paid/received cash now (balance → ₪0)<br>
      <strong>Carry →</strong> — balance rolls to next session
    </div>
    <div class="card">${rows}</div>
    <button class="btn-secondary full-width mt-md" onclick="navigate('history')">View History</button>`;
}

function confirmSettle(sessionId, playerId, settledInCash) {
  try {
    Sessions.confirmSettlement(sessionId, playerId, settledInCash);
    render();
    showToast(settledInCash ? 'Settled in cash — balance zeroed' : 'Balance carried forward', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── History ───────────────────────────────────────────────────────
function buildHistoryView() {
  const sessions = Sessions.all().slice().reverse();
  if (!sessions.length) return '<div class="empty-state"><div class="empty-icon">📋</div><div>No sessions yet</div></div>';

  const cards = sessions.map(s => {
    const playerRows = (s.players || []).map(p => {
      const gno = p.game_net_outcome;
      return `<div class="hist-player-row">
        <span>${esc(p.name)}</span>
        <span class="${balClass(gno)}">${gno > 0 ? '+' : ''}${fmtILS(gno)}</span>
      </div>`;
    }).join('');

    const deleteBtn = state.role === 'admin' && s.status === 'ended'
      ? `<button class="btn-danger btn-sm mt-sm" style="font-size:.72rem" onclick="promptDelete('${s.id}','${esc(s.title)}')">🗑 Delete &amp; Rollback</button>`
      : '';

    return `<div class="session-history-item">
      <div class="session-hist-title">♠ ${esc(s.title)}</div>
      <div class="session-hist-meta">${formatDate(s.start_time)} · ${s.players?.length || 0} players · Bank: ₪${s.starting_bank_cash}</div>
      ${playerRows}
      ${deleteBtn}
    </div>`;
  }).join('');

  return `<h2 class="mb-md">Session History</h2>${cards}`;
}

function promptDelete(sessionId, title) {
  document.getElementById('confirm-msg').textContent =
    `Delete "${title}" and roll back all player balances? This cannot be undone.`;
  document.getElementById('confirm-yes').onclick = () => showDeletePinPrompt(sessionId);
  document.getElementById('confirm-dialog').classList.remove('hidden');
}

function showDeletePinPrompt(sessionId) {
  closeConfirm();
  const reason = prompt('Enter reason for deletion:');
  if (!reason?.trim()) { showToast('Reason required', 'error'); return; }
  const pin = prompt('Confirm admin PIN:');
  try {
    Sessions.delete(sessionId, reason, pin);
    loadAndRender('history');
    showToast('Session deleted and profiles rolled back', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function closeConfirm() {
  document.getElementById('confirm-dialog').classList.add('hidden');
}

// ── Audit Log ─────────────────────────────────────────────────────
function buildLogsView() {
  const logs = Logs.all();
  if (!logs.length) return '<div class="empty-state"><div class="empty-icon">📜</div><div>No log entries yet</div></div>';
  const rows = logs.map(l => `
    <div class="log-entry">
      <div class="row gap-sm" style="flex-wrap:wrap;margin-bottom:3px">
        <span class="log-type">${l.action_type}</span>
        <span class="text-dim">${formatTime(l.timestamp)}</span>
        ${l.amount != null ? `<span class="text-gold" style="font-size:.8rem">₪${l.amount}</span>` : ''}
      </div>
      ${l.notes ? `<div class="text-dim" style="font-size:.75rem">${esc(l.notes)}</div>` : ''}
    </div>`).join('');
  return `<h2 class="mb-md">Audit Log</h2><div class="card">${rows}</div>`;
}

// ── Feedback ──────────────────────────────────────────────────────
function openFeedback() {
  switchFbTab('fb-submit');
  document.getElementById('fb-text').value = '';
  document.querySelector('input[name="fb-type"][value="bug"]').checked = true;
  renderFbInbox();
  document.getElementById('feedback-overlay').classList.remove('hidden');
}

function closeFeedback() {
  document.getElementById('feedback-overlay').classList.add('hidden');
  render(); // refresh top nav badge count
}

function switchFbTab(tab) {
  document.querySelectorAll('#feedback-overlay .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-fb-submit').classList.toggle('hidden', tab !== 'fb-submit');
  document.getElementById('tab-fb-inbox').classList.toggle('hidden', tab !== 'fb-inbox');
  if (tab === 'fb-inbox') renderFbInbox();
}

function submitFeedback() {
  const text = document.getElementById('fb-text').value.trim();
  if (!text) { showToast('Please enter some text', 'error'); return; }
  const type = document.querySelector('input[name="fb-type"]:checked')?.value || 'other';
  Feedback.add(type, text);
  document.getElementById('fb-text').value = '';
  renderFbBadge();
  showToast('Feedback saved', 'success');
  switchFbTab('fb-inbox');
}

function renderFbBadge() {
  const count = Feedback.all().length;
  const badge = document.getElementById('fb-count-badge');
  if (badge) badge.textContent = count > 0 ? count : '';
  const topBadge = document.querySelector('.topnav-fb-badge');
  if (topBadge) topBadge.textContent = count > 0 ? count : '';
}

function renderFbInbox() {
  const list = Feedback.all();
  renderFbBadge();
  const container = document.getElementById('fb-inbox-list');
  if (!container) return;
  const copyBtn = document.getElementById('fb-copy-btn');
  if (copyBtn) copyBtn.style.display = list.length ? '' : 'none';
  if (!list.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">💬</div><div>No feedback yet</div></div>';
    return;
  }
  const typeIcon = { bug: '🐛', feature: '💡', other: '📝' };
  container.innerHTML = list.map(f => `
    <div class="fb-item">
      <div class="fb-item-header">
        <span class="fb-type-tag fb-type-${f.type}">${typeIcon[f.type] || '📝'} ${f.type}</span>
        <span class="text-dim" style="font-size:.72rem">${formatTime(f.timestamp)}</span>
        <button class="btn-icon" style="font-size:.85rem;padding:2px 6px" onclick="deleteFeedback('${f.id}')">🗑</button>
      </div>
      <div class="fb-item-text">${esc(f.text).replace(/\n/g, '<br>')}</div>
    </div>`).join('');
}

function deleteFeedback(id) {
  Feedback.delete(id);
  renderFbInbox();
  render();
}

function copyAllFeedback() {
  const list = Feedback.all();
  if (!list.length) return;
  const text = list.map(f =>
    `[${f.type.toUpperCase()}] ${formatTime(f.timestamp)}\n${f.text}`
  ).join('\n\n---\n\n');
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied to clipboard', 'success'),
    () => showToast('Copy failed — try long-press', 'error')
  );
}

// ── AMA (Ask Me Anything) ──────────────────────────────────────────
const AMA_SYSTEM = `You are a helpful assistant for the Poker Bankroll Manager app. Answer questions about how to use the app clearly and concisely.

Here is the complete app guide:

## Overview
Poker Bankroll Manager tracks home poker game finances. It runs offline in the browser — all data is stored locally on this device.

## First-time Setup
1. On first open, you must set an Admin PIN (4 digits) and a Scorer PIN (4 digits).
2. The Admin PIN gives full access including session deletion, history management, and this AI assistant.
3. The Scorer PIN gives access to buy-ins and buy-out entry during a game (no destructive actions).

## Player Roster (👥 tab)
- Add players by typing a name and pressing "Add".
- Players have a Status (Active / Inactive). Only Active players can join sessions.
- Each player tracks two balances: Running Balance (current owed/owing across unsettled sessions) and Lifetime Value (cumulative net profit/loss across all settled games).
- Toggle a player Active/Inactive using the button on their row.

## Starting a Session (🃏 tab)
1. Tap "New Game" in the bottom nav.
2. Enter a session title (e.g. "Friday Night Deepstack").
3. Enter Starting Bank Cash — the cash amount the banker brings to the table.
4. Select 2–9 players using the checkboxes.
5. Optionally enter an Expense Credit (₪) per player for shared expenses like snacks. This amount is credited to their settlement.
6. Tap "Start Session ▶".

## Live Game (🎮 tab)
- The elliptical table board shows all seated players.
- Tap a player's seat chip to open the Buy-In / Credit overlay.
- **Buy-In tab**: Enter an amount or use quick buttons (₪100, ₪200, ₪300). Check "Mark as Debt" if the player is buying in on credit. Tap "Confirm Buy-In".
- **Credit/Adjust tab**: Enter a positive or negative amount with a reason to manually adjust a player's credit (e.g. correcting a data entry error).
- The stats bar at the top shows: Chips In Game, Cash in Bank, and Open Debt.
- Tap "End Game" when the session is over.

## Settlement / Tally (End Game)
1. After tapping "End Game", the Final Chip Count screen appears.
2. Enter each player's final chip count and tap "Calculate Settlement ▶".
3. **Settlement formula**:
   - Tax = 5% of winnings (applied only to players who made a profit)
   - Game Net = Final Chips − Total Investment − Tax
   - Final Settlement = Game Net + Expense Credit + Running Balance at session start
4. For each player, choose:
   - **Cash ✓** — they settle in cash now; their Running Balance resets to ₪0.
   - **Carry →** — the balance rolls forward to the next session.

## Session History (📋 tab)
- View all past sessions with player outcomes.
- **Admin only**: "Delete & Rollback" removes a session and fully reverses all player balance changes. Requires a reason and Admin PIN confirmation.

## Audit Log (📜 tab)
- Shows a timestamped log of every action: session starts/ends, buy-ins, credits, and deletions.

## Ask AI (🤖 tab — Admin only)
- This chat interface. Ask any question about how to use the app.
- Your Anthropic API key is stored locally on this device only and never sent anywhere except the official Claude API (api.anthropic.com).
- To update or clear your API key, tap the key icon at the top of this screen.

## Tips
- The app works fully offline after the first load.
- All data is stored in your browser's localStorage. Clearing browser data will erase all records.
- The banker's phone is the single source of truth — there is no cloud sync.
- Debt buy-ins show as a red glow on the seat chip during a game.
- Players marked Inactive are hidden from new session setup but their history is preserved.`;

function buildAMAView() {
  const hasKey = !!ApiKey.get();
  const msgs = state.amaMessages;

  const bubbles = msgs.map(m => {
    const isUser = m.role === 'user';
    return `<div class="ama-bubble ${isUser ? 'ama-user' : 'ama-bot'}">
      ${!isUser ? '<div class="ama-bot-label">🤖 AI</div>' : ''}
      <div class="ama-text">${esc(m.content).replace(/\n/g, '<br>')}</div>
    </div>`;
  }).join('');

  const emptyState = !msgs.length ? `
    <div class="ama-empty">
      <div style="font-size:2rem;margin-bottom:8px">🤖</div>
      <div style="font-weight:600;margin-bottom:4px">Ask Me Anything</div>
      <div class="text-dim">Ask how to use any feature of the app.</div>
    </div>` : '';

  const keyArea = hasKey
    ? `<button class="btn-icon ama-key-btn" onclick="amaShowKeyInput()" title="Update API key">🔑</button>`
    : '';

  return `
    <div class="ama-header-row">
      <h2>Ask AI</h2>
      ${keyArea}
    </div>
    ${!hasKey ? `
    <div class="card ama-setup-card">
      <div class="text-muted mb-sm">To use the AI assistant, enter your Anthropic API key. It is stored only on this device.</div>
      <input id="ama-key-input" type="password" placeholder="sk-ant-api03-..." class="input-field mb-sm" autocomplete="off">
      <button class="btn-primary full-width" onclick="amaSaveKey()">Save API Key</button>
    </div>` : ''}
    <div id="ama-messages" class="ama-messages">
      ${emptyState}${bubbles}
    </div>
    ${hasKey ? `
    <div class="ama-input-bar">
      <textarea id="ama-input" class="ama-textarea" placeholder="Ask a question…" rows="2"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();amaSend()}"></textarea>
      <button class="ama-send-btn" onclick="amaSend()">➤</button>
    </div>` : ''}`;
}

function scrollAMAToBottom() {
  const el = document.getElementById('ama-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function amaSaveKey() {
  const val = document.getElementById('ama-key-input')?.value?.trim();
  if (!val || !val.startsWith('sk-ant-')) {
    showToast('API key must start with sk-ant-', 'error'); return;
  }
  ApiKey.save(val);
  render();
  showToast('API key saved', 'success');
}

function amaShowKeyInput() {
  const newKey = prompt('Enter new Anthropic API key (or leave blank to clear):');
  if (newKey === null) return;
  if (!newKey.trim()) { ApiKey.clear(); render(); showToast('API key cleared', 'success'); return; }
  if (!newKey.trim().startsWith('sk-ant-')) { showToast('Invalid key format', 'error'); return; }
  ApiKey.save(newKey);
  showToast('API key updated', 'success');
}

async function amaSend() {
  const input = document.getElementById('ama-input');
  const text = input?.value?.trim();
  if (!text) return;
  const key = ApiKey.get();
  if (!key) { showToast('No API key saved', 'error'); return; }

  input.value = '';
  input.disabled = true;
  document.querySelector('.ama-send-btn')?.setAttribute('disabled', true);

  state.amaMessages.push({ role: 'user', content: text });
  renderAMAMessages(true);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: AMA_SYSTEM,
        messages: state.amaMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '(no response)';
    state.amaMessages.push({ role: 'assistant', content: reply });
  } catch (e) {
    state.amaMessages.push({ role: 'assistant', content: `Error: ${e.message}` });
  }

  renderAMAMessages(false);
  if (input) { input.disabled = false; input.focus(); }
  document.querySelector('.ama-send-btn')?.removeAttribute('disabled');
}

function renderAMAMessages(loading) {
  const container = document.getElementById('ama-messages');
  if (!container) return;

  const msgs = state.amaMessages;
  const bubbles = msgs.map(m => {
    const isUser = m.role === 'user';
    return `<div class="ama-bubble ${isUser ? 'ama-user' : 'ama-bot'}">
      ${!isUser ? '<div class="ama-bot-label">🤖 AI</div>' : ''}
      <div class="ama-text">${esc(m.content).replace(/\n/g, '<br>')}</div>
    </div>`;
  }).join('');

  const loadingDot = loading ? '<div class="ama-bubble ama-bot ama-loading"><div class="ama-bot-label">🤖 AI</div><div class="ama-dots"><span></span><span></span><span></span></div></div>' : '';

  container.innerHTML = bubbles + loadingDot;
  container.scrollTop = container.scrollHeight;
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtILS(n) {
  if (n == null) return '₪0';
  return (n < 0 ? '-' : '') + '₪' + Math.abs(n).toLocaleString('he-IL');
}
function fmtBalance(n) { return (n > 0 ? '+' : '') + fmtILS(n); }
function balClass(n) { return n > 0 ? 'text-green' : n < 0 ? 'text-red' : 'text-muted'; }
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg, type='') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
