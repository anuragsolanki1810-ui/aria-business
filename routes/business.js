// ============================================================
//  ARIA Platform — Business Routes (Multi-tenant)
// ============================================================

const express = require('express');
const router  = express.Router();
const { Customer } = require('../models');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// GET all customers for this business
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find({ businessId: req.business.id })
      .sort({ createdAt: -1 }).limit(100);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
