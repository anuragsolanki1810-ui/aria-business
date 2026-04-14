// ============================================================
//  ARIA Business Platform v5.0
//  Vapi + ElevenLabs + Groq + Railway
// ============================================================

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app  = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ─────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ── Routes ───────────────────────────────────────────────────
const { router: authRouter } = require('./routes/auth');
app.use('/auth',         authRouter);
app.use('/appointments', require('./routes/appointments'));
app.use('/chat',         require('./routes/chat'));
app.use('/voice',        require('./routes/voice'));   // Keep for old Twilio fallback
app.use('/vapi',         require('./routes/vapi'));    // New Vapi webhooks
app.use('/business',     require('./routes/business'));
app.use('/settings',     require('./routes/settings'));
app.use('/admin',        require('./routes/admin'));
app.use('/billing',      require('./routes/billing'));

// ── Health ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:   'ok',
    message:  'ARIA Business Platform v5.0',
    version:  '5.0.0',
    stack:    'Vapi + ElevenLabs Meera + Groq + Railway',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── Reminders ────────────────────────────────────────────────
const { startReminderScheduler } = require('./services/reminderScheduler');
startReminderScheduler();

// ── Start ─────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   ARIA Business Platform v5.0              ║
║   http://localhost:${port}                    ║
║   Voice: ElevenLabs Meera (Natural Hindi)  ║
║   Calls: Vapi.ai                           ║
║   AI:    Groq Llama 3.3                    ║
╚════════════════════════════════════════════╝
  `);
});
