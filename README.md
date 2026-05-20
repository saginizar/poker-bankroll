# Poker Bankroll Manager

Home poker game bankroll manager — tracks buy-ins, chip equity, expenses, and financial settlement with full audit trail.

## Recovery — fresh machine setup

### Prerequisites

- [ ] Node.js 18+

### Environment setup

1. Clone: `git clone git@github.com:saginizar/poker-bankroll.git`
2. `cd poker-bankroll && npm install`
3. Copy env: `cp .env.example .env`
4. Edit `.env` — set JWT_SECRET and admin credentials

### Secret locations

| Variable | Where to get it |
|---|---|
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_USERNAME` | Choose your admin username |
| `ADMIN_PASSWORD` | Choose your admin password |

### Run locally

```bash
npm start
```

Server prints your LAN IP on startup — open that on your phone.
Default login: `admin` / `admin123` (change via .env)

## Project structure

```
src/           Express backend
  db.js        SQLite schema + seed
  server.js    Entry point
  routes/      auth, players, sessions, logs
  middleware/  JWT auth
public/        Frontend SPA
  index.html
  css/style.css
  js/api.js    API client
  js/app.js    Full SPA logic
poker.db       Auto-created on first run (gitignored)
.env.example   Secret template — commit this, never .env
```

## Key decisions

- SQLite + better-sqlite3: zero-config, single file, LAN-accessible from phone
- All values in whole ILS (shekels)
- 5% tax on net winners only; losers pay zero tax
- Session rollback uses stored `initial_balance_at_start` snapshot, not formula reversal
- JWT 24h expiry; no refresh tokens needed for home game use
