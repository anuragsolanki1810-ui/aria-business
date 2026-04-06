// ============================================================
//  ARIA Platform — Chat Routes (Multi-tenant)
// ============================================================

const express  = require('express');
const router   = express.Router();
const { chat } = require('../services/aiService');
const { CallLog } = require('../models');
const { authMiddleware } = require('./auth');

// POST /chat — Web chat (requires auth)
router.post('/', authMiddleware, async (req, res) => {
  const { message, callerPhone } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const { reply, action, actionResult } = await chat(
      [{ role: 'user', content: message }],
      callerPhone || '',
      req.business.id
    );
    res.json({ reply, action: action || null, actionResult: actionResult || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/logs — Call logs for this business
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await CallLog.find({ businessId: req.business.id })
      .sort({ createdAt: -1 }).limit(50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
