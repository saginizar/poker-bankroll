require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const { init } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/logs', require('./routes/logs'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Init DB before accepting requests
init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    for (const iface of Object.values(nets)) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
      }
    }
    console.log(`\n♠  Poker Bankroll Manager`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIp}:${PORT}  ← open on phone\n`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
