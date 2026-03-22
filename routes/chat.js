// ============================================================
//  ARIA Business OS — Chat Routes (Web + Dashboard)
// ============================================================

const express  = require('express');
const router   = express.Router();
const { chat } = require('../services/aiService');
const { CallLog } = require('../models');

// POST /chat — Used by web widget and dashboard
router.post('/', async (req, res) => {
  const { message, sessionId, callerPhone } = req.body;

  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const { reply, action, actionResult } = await chat(
      [{ role: 'user', content: message }],
      callerPhone || ''
    );

    res.json({
      reply,
      action:       action       || null,
      actionResult: actionResult || null,
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/logs — Recent call logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await CallLog.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
