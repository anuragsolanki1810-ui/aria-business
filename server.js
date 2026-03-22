// ============================================================
//  ARIA Business OS — Main Server
//  AI Voice Agent for Business
// ============================================================

const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
require('dotenv').config();

const app  = express();
const port = process.env.PORT || 4000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for Twilio webhooks

// ── Database connection ──────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-business')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err.message));

// ── Routes ───────────────────────────────────────────────────
app.use('/chat',         require('./routes/chat'));
app.use('/appointments', require('./routes/appointments'));
app.use('/voice',        require('./routes/voice'));
app.use('/business',     require('./routes/business'));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:   'ok',
    message:  'ARIA Business OS is running',
    version:  '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── Start reminder scheduler ─────────────────────────────────
const { startReminderScheduler } = require('./services/reminderScheduler');
startReminderScheduler();

// ── Start server ─────────────────────────────────────────────
app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════╗
║     ARIA Business OS — Running       ║
║     http://localhost:${port}            ║
║     Health: /health                  ║
╚══════════════════════════════════════╝
  `);
});
