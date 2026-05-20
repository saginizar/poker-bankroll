const API = (() => {
  const base = '/api';

  function token() { return localStorage.getItem('token'); }

  async function req(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const t = token();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(base + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  return {
    login: (u, p) => req('POST', '/auth/login', { username: u, password: p }),
    getPlayers: () => req('GET', '/players'),
    createPlayer: (name) => req('POST', '/players', { name }),
    setPlayerStatus: (id, status) => req('PATCH', `/players/${id}/status`, { status }),
    getSessions: () => req('GET', '/sessions'),
    getActiveSession: () => req('GET', '/sessions/active'),
    startSession: (data) => req('POST', '/sessions', data),
    buyin: (sid, data) => req('POST', `/sessions/${sid}/buyin`, data),
    creditAdjust: (sid, data) => req('POST', `/sessions/${sid}/credit`, data),
    settle: (sid, chip_counts) => req('POST', `/sessions/${sid}/settle`, { chip_counts }),
    confirmSettlement: (sid, player_id, settled_in_cash) =>
      req('POST', `/sessions/${sid}/confirm-settlement`, { player_id, settled_in_cash }),
    deleteSession: (sid, reason) => req('DELETE', `/sessions/${sid}`, { reason }),
    getLogs: () => req('GET', '/logs'),
  };
})();
