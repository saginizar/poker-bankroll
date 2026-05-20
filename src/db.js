const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'poker.db');

let _db = null;
let _saveTimer = null;

function save() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (_db) fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
  }, 300);
}

// sql.js returns column arrays; convert to object rows
function toObjects(results) {
  if (!results || !results.length) return [];
  const { columns, values } = results[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// Synchronous helpers (call after init())
const db = {
  all(sql, params = []) {
    const res = _db.exec(sql, params);
    return toObjects(res);
  },
  get(sql, params = []) {
    return this.all(sql, params)[0] || null;
  },
  run(sql, params = []) {
    _db.run(sql, params);
    save();
  },
  transaction(fn) {
    _db.run('BEGIN');
    try {
      fn();
      _db.run('COMMIT');
      save();
    } catch (e) {
      _db.run('ROLLBACK');
      throw e;
    }
  }
};

let _initPromise = null;

async function init() {
  if (_db) return db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      _db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      _db = new SQL.Database();
    }

    _db.run(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'Active',
        lifetime_value INTEGER NOT NULL DEFAULT 0,
        running_balance INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Standard_User'
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        starting_bank_cash INTEGER NOT NULL DEFAULT 0,
        total_expenses INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE IF NOT EXISTS session_players (
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        initial_balance_at_start INTEGER NOT NULL DEFAULT 0,
        expense_credit INTEGER NOT NULL DEFAULT 0,
        cash_buy_ins INTEGER NOT NULL DEFAULT 0,
        debt_buy_ins INTEGER NOT NULL DEFAULT 0,
        final_chip_count INTEGER NOT NULL DEFAULT 0,
        game_net_outcome INTEGER NOT NULL DEFAULT 0,
        final_payout_or_debt INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS action_log (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action_type TEXT NOT NULL,
        amount INTEGER,
        notes TEXT
      );
    `);

    const count = db.get('SELECT COUNT(*) as c FROM users')?.c || 0;
    if (count === 0) {
      const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?,?,?,?)',
        [uuidv4(), process.env.ADMIN_USERNAME || 'admin', hash, 'Admin']);
      console.log('Default admin created (change via .env)');
    }

    return db;
  })();

  return _initPromise;
}

module.exports = { init };
