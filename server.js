// ============================================================
//  ARIA Platform — Main Server v2.0
//  Multi-tenant AI Voice Agent Platform
// ============================================================

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app  = express();
const port = process.env.PORT || 4000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ─────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err.message));

// ── Routes ───────────────────────────────────────────────────
const { router: authRouter } = require('./routes/auth');
app.use('/auth',         authRouter);
app.use('/appointments', require('./routes/appointments'));
app.use('/chat',         require('./routes/chat'));
app.use('/voice',        require('./routes/voice'));
app.use('/business',     require('./routes/business'));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:   'ok',
    message:  'ARIA Platform is running',
    version:  '2.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── Reminder scheduler ───────────────────────────────────────
const { startReminderScheduler } = require('./services/reminderScheduler');
startReminderScheduler();

// ── Start ─────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════╗
║     ARIA Platform v2.0 — Running     ║
║     http://localhost:${port}            ║
╚══════════════════════════════════════╝
  `);
});
