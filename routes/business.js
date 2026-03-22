// ============================================================
//  ARIA Business OS — Business & Customer Routes
// ============================================================

const express  = require('express');
const router   = express.Router();
const { Business, Customer } = require('../models');

// ── Business Settings ─────────────────────────────────────────

// GET business settings
router.get('/settings', async (req, res) => {
  try {
    let business = await Business.findOne();
    if (!business) {
      business = await Business.create({
        name: process.env.BUSINESS_NAME || 'My Business',
        services: [
          { name: 'Consultation', duration: 30, price: 500 },
          { name: 'Full Service',  duration: 60, price: 1000 },
        ],
        workingHours: {
          monday:    { open: '09:00', close: '18:00', closed: false },
          tuesday:   { open: '09:00', close: '18:00', closed: false },
          wednesday: { open: '09:00', close: '18:00', closed: false },
          thursday:  { open: '09:00', close: '18:00', closed: false },
          friday:    { open: '09:00', close: '18:00', closed: false },
          saturday:  { open: '10:00', close: '16:00', closed: false },
          sunday:    { open: '10:00', close: '14:00', closed: true  },
        },
      });
    }
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update business settings
router.patch('/settings', async (req, res) => {
  try {
    const business = await Business.findOneAndUpdate(
      {},
      req.body,
      { new: true, upsert: true }
    );
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Customers ─────────────────────────────────────────────────

// GET all customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).limit(100);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single customer
router.get('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
