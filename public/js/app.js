// ── State ──────────────────────────────────────────────────────────
const state = {
  user: null,         // { token, role, username }
  view: 'roster',     // current nav tab
  activeSession: null,
  players: [],
  sessions: [],
  selectedPlayer: null,  // player in overlay
  tallyResults: null,
};

// ── Boot ────────────────────────────────────────────────────────────
(function init() {
  const saved = localStorage.getItem('user');
  if (saved) {
    try { state.user = JSON.parse(saved); } catch { state.user = null; }
  }
  if (!state.user) { renderLogin(); return; }
  loadAndRender('roster');
})();

// ── Auth ─────────────────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-icon">♠</div>
        <div class="login-title">Poker Bankroll</div>
        <div class="login-subtitle">Home Game Manager</div>
        <div class="input-row mt-md">
          <input id="l-user" type="text" placeholder="Username" class="input-field" autocomplete="username" autocapitalize="none">
        </div>
        <div class="input-row">
          <input id="l-pass" type="password" placeholder="Password" class="input-field" autocomplete="current-password">
        </div>
        <button class="btn-primary full-width mt-sm" onclick="doLogin()">Sign In</button>
        <div id="login-err" class="login-error"></div>
      </div>
    </div>`;
  document.getElementById('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const u = document.getElementById('l-user').value.trim();
  const p = document.getElementById('l-pass').value;
  try {
    const data = await API.login(u, p);
    state.user = data;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    loadAndRender('roster');
  } catch (e) {
    document.getElementById('login-err').textContent = e.message;
  }
}

function doLogout() {
  localStorage.clear();
  state.user = null;
  renderLogin();
}

// ── Navigation ──────────────────────────────────────────────────────
async function loadAndRender(view) {
  state.view = view;
  try {
    const [players, active, sessions] = await Promise.all([
      API.getPlayers(),
      API.getActiveSession(),
      API.getSessions(),
    ]);
    state.players = players;
    state.activeSession = active;
    state.sessions = sessions;
  } catch (e) {
    if (e.message === 'Unauthorized' || e.message === 'Invalid token') { doLogout(); return; }
    showToast('Error loading data', 'error');
  }
  render();
}

function navigate(view) {
  state.tallyResults = null;
  loadAndRender(view);
}

function render() {
  const app = document.getElementById('app');
  const hasActive = !!state.activeSession;

  let html = buildTopNav() + '<div class="page" style="padding-top:8px;padding-bottom:90px;">';
  switch (state.view) {
    case 'roster':   html += buildRosterView(); break;
    case 'session':  html += hasActive ? buildGameBoard() : buildNewSession(); break;
    case 'tally':    html += buildTallyView(); break;
    case 'history':  html += buildHistoryView(); break;
    case 'logs':     html += buildLogsView(); break;
  }
  html += '</div>' + buildBottomNav();
  app.innerHTML = html;
  attachDynamicHandlers();
}

function buildTopNav() {
  const isAdmin = state.user?.role === 'Admin';
  return `<div class="topnav">
    <span class="topnav-title">♠ Poker Bankroll ${isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</span>
    <div class="topnav-actions">
      <button class="btn-icon" onclick="doLogout()" title="Logout">⏻</button>
    </div>
  </div>`;
}

function buildBottomNav() {
  const v = state.view;
  const hasActive = !!state.activeSession;
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
  </nav>`;
}

// ── Roster View ──────────────────────────────────────────────────────
function buildRosterView() {
  let rows = state.players.map(p => {
    const balStr = fmtBalance(p.running_balance);
    const ltv = fmtILS(Math.abs(p.lifetime_value)) + (p.lifetime_value >= 0 ? '' : ' loss');
    return `<div class="player-row">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div class="player-info">
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-stats">Balance: <span class="${balClass(p.running_balance)}">${balStr}</span> &nbsp;|&nbsp; Lifetime: <span class="text-muted">${fmtILS(p.lifetime_value)}</span></div>
      </div>
      <span class="status-badge ${p.status==='Active'?'status-active':'status-inactive'}">${p.status}</span>
      <button class="toggle-btn" onclick="toggleStatus('${p.id}','${p.status}')">${p.status==='Active'?'Deactivate':'Activate'}</button>
    </div>`;
  }).join('');

  if (!rows) rows = '<div class="empty-state"><div class="empty-icon">👤</div><div>No players yet</div></div>';

  return `
    <h2 class="mb-md">Player Roster</h2>
    <div class="card">
      <div class="input-row row gap-sm">
        <input id="new-player-name" type="text" placeholder="New player name" class="input-field" style="flex:1" autocapitalize="words">
        <button class="btn-primary btn-sm" onclick="addPlayer()">Add</button>
      </div>
    </div>
    <div class="card">${rows}</div>`;
}

async function addPlayer() {
  const inp = document.getElementById('new-player-name');
  const name = inp?.value?.trim();
  if (!name) return;
  try {
    const p = await API.createPlayer(name);
    state.players.push(p);
    inp.value = '';
    render();
    showToast(`${p.name} added`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function toggleStatus(id, current) {
  const next = current === 'Active' ? 'Inactive' : 'Active';
  try {
    const p = await API.setPlayerStatus(id, next);
    const idx = state.players.findIndex(x => x.id === id);
    if (idx >= 0) state.players[idx] = p;
    render();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── New Session View ─────────────────────────────────────────────────
function buildNewSession() {
  const active = state.players.filter(p => p.status === 'Active');
  const rows = active.map(p => `
    <div class="player-select-row">
      <input type="checkbox" id="sel-${p.id}" value="${p.id}" onchange="updateSelCount()" style="width:18px;height:18px;accent-color:var(--gold)">
      <label for="sel-${p.id}" style="flex:1;cursor:pointer;font-weight:600">${esc(p.name)}</label>
      <span class="text-dim" style="font-size:.75rem;margin-right:4px">🛒</span>
      <input type="number" min="0" step="1" placeholder="₪0" class="expense-input" id="exp-${p.id}" value="">
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
        <input id="session-bank" type="number" min="0" step="1" placeholder="0" class="input-field">
      </div>
    </div>
    <div class="card">
      <div class="row mb-md">
        <h3>Select Players</h3>
        <span class="spacer"></span>
        <span class="selected-count" id="sel-count">0 / 9 selected</span>
      </div>
      <div class="text-dim mb-sm" style="font-size:.75rem">🛒 = shopping expense credit</div>
      ${rows || '<div class="text-muted text-center">No active players</div>'}
    </div>
    <button class="btn-gold full-width" style="padding:14px" onclick="startSession()">Start Session ▶</button>`;
}

function updateSelCount() {
  const checked = document.querySelectorAll('[id^="sel-"]:checked').length;
  const el = document.getElementById('sel-count');
  if (el) el.textContent = `${checked} / 9 selected`;
}

async function startSession() {
  const title = document.getElementById('session-title')?.value?.trim();
  const bank = parseInt(document.getElementById('session-bank')?.value || 0);
  const checkboxes = document.querySelectorAll('[id^="sel-"]:checked');
  const player_ids = Array.from(checkboxes).map(c => c.value);

  if (!title) { showToast('Enter a session title', 'error'); return; }
  if (player_ids.length < 2) { showToast('Select at least 2 players', 'error'); return; }
  if (player_ids.length > 9) { showToast('Maximum 9 players', 'error'); return; }

  const expense_credits = {};
  for (const pid of player_ids) {
    const val = parseInt(document.getElementById(`exp-${pid}`)?.value || 0);
    if (val > 0) expense_credits[pid] = val;
  }

  try {
    const session = await API.startSession({ title, starting_bank_cash: bank, player_ids, expense_credits });
    state.activeSession = session;
    state.view = 'session';
    render();
    showToast('Session started!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Game Board (Live Elliptical) ─────────────────────────────────────
function buildGameBoard() {
  const s = state.activeSession;
  const players = s.players || [];
  const n = players.length;

  // Live calc
  const totalChips = players.reduce((a, p) => a + p.cash_buy_ins + p.debt_buy_ins + p.expense_credit, 0);
  const cashInBank = s.starting_bank_cash + players.reduce((a, p) => a + p.cash_buy_ins, 0);
  const openDebt = players.reduce((a, p) => a + p.debt_buy_ins, 0);

  // Ellipse seat positions (0 = top, clockwise)
  const seats = ellipsePositions(n);

  const seatNodes = players.map((p, i) => {
    const pos = seats[i];
    const totalIn = p.cash_buy_ins + p.debt_buy_ins;
    return `<div class="seat-node" style="left:${pos.x}%;top:${pos.y}%;" onclick="openOverlay('${p.player_id}','${esc(p.name)}')">
      <div class="seat-chip">
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

    <div class="card" style="margin-bottom:8px;padding:8px 12px">
      <div class="row">
        <span class="text-muted" style="font-size:.8rem">📅 ${esc(s.title)}</span>
        <span class="spacer"></span>
        <span class="text-dim" style="font-size:.75rem">${formatTime(s.start_time)}</span>
      </div>
    </div>

    <div class="ellipse-container">
      <div class="table-felt">
        <div class="central-monitor">
          <div class="monitor-label">Chips</div>
          <div class="monitor-value">${fmtILS(totalChips)}</div>
          <div class="monitor-label" style="margin-top:6px">Bank</div>
          <div class="monitor-value text-green">${fmtILS(cashInBank)}</div>
        </div>
      </div>
      ${seatNodes}
    </div>

    <div class="end-session-bar">
      <span style="font-size:1.2rem">🏁</span>
      <div style="flex:1">
        <div style="font-weight:700;color:var(--gold)">End Session</div>
        <div class="text-dim" style="font-size:.75rem">Tap to enter final chip counts</div>
      </div>
      <button class="btn-danger btn-sm" onclick="navigate('tally')">End Game</button>
    </div>`;
}

function ellipsePositions(n) {
  // Returns {x,y} percentages for n seats around an ellipse
  // cx=50, cy=50, rx=44, ry=42, start at top (-π/2)
  const positions = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const x = 50 + 44 * Math.cos(angle);
    const y = 50 + 42 * Math.sin(angle);
    positions.push({ x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) });
  }
  return positions;
}

// ── Player Action Overlay ────────────────────────────────────────────
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

function addBuyin(amount) {
  const inp = document.getElementById('buyin-amount');
  inp.value = amount;
}

async function submitBuyin() {
  const sid = state.activeSession?.id;
  const pid = state.selectedPlayer?.id;
  if (!sid || !pid) return;
  const amount = parseInt(document.getElementById('buyin-amount').value);
  const is_debt = document.getElementById('buyin-is-debt').checked;
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  try {
    await API.buyin(sid, { player_id: pid, amount, is_debt });
    closeOverlay();
    const updated = await API.getActiveSession();
    state.activeSession = updated;
    render();
    showToast(`₪${amount} ${is_debt ? 'debt' : 'cash'} buy-in for ${state.selectedPlayer?.name || ''}`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function submitCredit() {
  const sid = state.activeSession?.id;
  const pid = state.selectedPlayer?.id;
  if (!sid || !pid) return;
  const amount = parseInt(document.getElementById('credit-amount').value);
  const notes = document.getElementById('credit-notes').value.trim();
  if (!amount) { showToast('Enter an amount', 'error'); return; }
  if (!notes) { showToast('Notes are required', 'error'); return; }
  try {
    await API.creditAdjust(sid, { player_id: pid, amount, notes });
    closeOverlay();
    const updated = await API.getActiveSession();
    state.activeSession = updated;
    render();
    showToast('Adjustment applied', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tally & Settlement View ──────────────────────────────────────────
function buildTallyView() {
  if (state.tallyResults) return buildSettlementResults();

  const s = state.activeSession;
  if (!s) {
    return '<div class="empty-state"><div class="empty-icon">🏁</div><div>No active session</div></div>';
  }
  const players = s.players || [];

  const rows = players.map(p => `
    <div class="tally-player">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600">${esc(p.name)}</div>
        <div class="text-dim" style="font-size:.75rem">In: ₪${p.cash_buy_ins + p.debt_buy_ins}</div>
      </div>
      <div>
        <label class="input-label" style="text-align:right">Final chips</label>
        <input type="number" min="0" step="1" placeholder="0" class="chip-input" id="chips-${p.player_id}">
      </div>
    </div>`).join('');

  return `
    <h2 class="mb-md">🏁 End Session — Chip Count</h2>
    <div class="card text-muted" style="font-size:.8rem;margin-bottom:8px">
      Enter each player's final physical chip count. Tax (5%) applies to winners only.
    </div>
    <div class="card">${rows}</div>
    <button class="btn-gold full-width" style="padding:14px" onclick="submitTally()">Calculate Settlement</button>
    <button class="btn-secondary full-width mt-sm" onclick="navigate('session')">← Back to Game</button>`;
}

async function submitTally() {
  const s = state.activeSession;
  if (!s) return;
  const players = s.players || [];
  const chip_counts = {};
  for (const p of players) {
    const val = document.getElementById(`chips-${p.player_id}`)?.value;
    if (val === '' || val === null || val === undefined) {
      showToast(`Enter chip count for ${p.name}`, 'error'); return;
    }
    chip_counts[p.player_id] = parseInt(val);
  }
  try {
    const data = await API.settle(s.id, chip_counts);
    state.tallyResults = { sessionId: s.id, results: data.results };
    state.activeSession = null;
    render();
  } catch (e) { showToast(e.message, 'error'); }
}

function buildSettlementResults() {
  const { sessionId, results } = state.tallyResults;

  const rows = results.map(r => {
    const fs = r.final_settlement;
    const sign = fs > 0 ? '+' : '';
    const cls = fs > 0 ? 'text-green' : fs < 0 ? 'text-red' : 'text-muted';
    const settled = r._settled;
    return `<div class="result-row" id="res-${r.player_id}">
      <div>
        <div class="result-name">${esc(r.name)}</div>
        <div class="text-dim" style="font-size:.72rem">
          In: ₪${r.total_investment} &nbsp;|&nbsp;
          Chips: ₪${r.final_chips} &nbsp;|&nbsp;
          Tax: ₪${r.tax}
        </div>
      </div>
      <div style="text-align:right">
        <div class="result-amount ${cls}">${sign}${fmtILS(fs)}</div>
        ${settled === undefined ? `
          <div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end">
            <span class="settlement-badge badge-cash" onclick="confirmSettle('${sessionId}','${r.player_id}',true)">Cash ✓</span>
            <span class="settlement-badge badge-carry" onclick="confirmSettle('${sessionId}','${r.player_id}',false)">Carry →</span>
          </div>` : `<div class="text-dim" style="font-size:.7rem;margin-top:2px">${settled ? '✓ Settled cash' : '→ Carried forward'}</div>`}
      </div>
    </div>`;
  }).join('');

  return `
    <h2 class="mb-md">Settlement Results</h2>
    <div class="card text-muted" style="font-size:.8rem;margin-bottom:8px">
      For each player: tap <strong>Cash ✓</strong> if they paid/received cash now, or <strong>Carry →</strong> to roll balance forward.
    </div>
    <div class="card">${rows}</div>
    <button class="btn-secondary full-width mt-md" onclick="navigate('history')">View History</button>`;
}

async function confirmSettle(sessionId, playerId, settledInCash) {
  try {
    await API.confirmSettlement(sessionId, playerId, settledInCash);
    const r = state.tallyResults.results.find(x => x.player_id === playerId);
    if (r) r._settled = settledInCash;
    // Patch players state
    const updated = await API.getPlayers();
    state.players = updated;
    render();
    showToast(settledInCash ? 'Settled in cash' : 'Balance carried forward', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── History View ─────────────────────────────────────────────────────
function buildHistoryView() {
  if (!state.sessions.length) {
    return '<div class="empty-state"><div class="empty-icon">📋</div><div>No sessions yet</div></div>';
  }

  const cards = state.sessions.map(s => {
    const isAdmin = state.user?.role === 'Admin';
    const playerRows = (s.players || []).map(p => {
      const gno = p.game_net_outcome;
      const cls = gno > 0 ? 'text-green' : gno < 0 ? 'text-red' : 'text-muted';
      return `<div class="hist-player-row">
        <span>${esc(p.name)}</span>
        <span class="${cls}">${gno > 0 ? '+' : ''}${fmtILS(gno)}</span>
      </div>`;
    }).join('');

    const deleteBtn = isAdmin && s.status === 'ended' ? `
      <button class="btn-danger btn-sm mt-sm" style="font-size:.7rem" onclick="promptDeleteSession('${s.id}','${esc(s.title)}')">Delete & Rollback</button>` : '';

    return `<div class="session-history-item">
      <div class="session-hist-title">♠ ${esc(s.title)}</div>
      <div class="session-hist-meta">${formatDate(s.start_time)} · ${s.players?.length || 0} players · Bank: ₪${s.starting_bank_cash} · Status: ${s.status}</div>
      ${playerRows}
      ${deleteBtn}
    </div>`;
  }).join('');

  return `<h2 class="mb-md">Session History</h2>${cards}`;
}

function promptDeleteSession(sessionId, title) {
  document.getElementById('confirm-msg').textContent = `Delete "${title}" and roll back all player balances? This cannot be undone.`;
  document.getElementById('confirm-yes').onclick = () => deleteSession(sessionId);
  document.getElementById('confirm-dialog').classList.remove('hidden');
}

async function deleteSession(sessionId) {
  closeConfirm();
  const reason = prompt('Enter deletion reason (required):');
  if (!reason || !reason.trim()) { showToast('Reason required', 'error'); return; }
  try {
    await API.deleteSession(sessionId, reason);
    await loadAndRender('history');
    showToast('Session deleted and profiles rolled back', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function closeConfirm() {
  document.getElementById('confirm-dialog').classList.add('hidden');
}

// ── Audit Log View ───────────────────────────────────────────────────
async function buildLogsView() {
  // Logs loaded fresh each time this view is called via attachDynamicHandlers
  return `<h2 class="mb-md">Audit Log</h2>
    <div class="card" id="logs-container">
      <div class="text-muted text-center" style="padding:12px">Loading…</div>
    </div>`;
}

async function loadLogs() {
  const container = document.getElementById('logs-container');
  if (!container) return;
  try {
    const logs = await API.getLogs();
    if (!logs.length) { container.innerHTML = '<div class="empty-state"><div>No log entries yet</div></div>'; return; }
    container.innerHTML = logs.map(l => `
      <div class="log-entry">
        <div class="row gap-sm mb-sm" style="flex-wrap:wrap">
          <span class="log-type">${l.action_type}</span>
          <span class="text-dim">${formatTime(l.timestamp)}</span>
          <span class="text-muted" style="font-size:.75rem">by ${esc(l.username)}</span>
          ${l.amount != null ? `<span class="text-gold" style="font-size:.8rem">₪${l.amount}</span>` : ''}
        </div>
        ${l.notes ? `<div class="text-dim" style="font-size:.75rem">${esc(l.notes)}</div>` : ''}
      </div>`).join('');
  } catch (e) { container.innerHTML = '<div class="text-red text-center">Failed to load logs</div>'; }
}

// ── Attach handlers after render ─────────────────────────────────────
function attachDynamicHandlers() {
  if (state.view === 'logs') loadLogs();
  // Close overlay on background tap
  const ov = document.getElementById('overlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeOverlay(); });
  const cd = document.getElementById('confirm-dialog');
  if (cd) cd.addEventListener('click', e => { if (e.target === cd) closeConfirm(); });
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmtILS(n) {
  if (n === null || n === undefined) return '₪0';
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + '₪' + abs.toLocaleString('he-IL');
}

function fmtBalance(n) {
  if (n > 0) return '+' + fmtILS(n);
  return fmtILS(n);
}

function balClass(n) {
  if (n > 0) return 'text-green';
  if (n < 0) return 'text-red';
  return 'text-muted';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
