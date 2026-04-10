// ============================================================
//  ARIA Platform — Admin Routes v4.0
// ============================================================

const express = require('express');
const router  = express.Router();
const { Business, PhoneNumber, Appointment, Customer, CallLog } = require('../models');
const { addNumberToPool, assignNumberToBusiness, releaseNumber, getPoolStats, syncFromTwilio } = require('../services/phoneService');

const ADMIN_KEY = process.env.ADMIN_KEY || 'aria-admin-2025';

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
router.use(adminAuth);

// GET /admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, trial, starter, growth, pro, poolStats] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ plan: 'trial' }),
      Business.countDocuments({ plan: 'starter' }),
      Business.countDocuments({ plan: 'growth' }),
      Business.countDocuments({ plan: 'pro' }),
      getPoolStats(),
    ]);

    const active = starter + growth + pro;
    const mrr    = (starter * 2000) + (growth * 4000) + (pro * 8000);
    const recent = await Business.find().sort({ createdAt: -1 }).limit(5).select('-password');

    res.json({
      stats: { total, active, trial, starter, growth, pro, mrr, pool: poolStats },
      recent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/businesses
router.get('/businesses', async (req, res) => {
  try {
    const filter = {};
    if (req.query.plan) filter.plan = req.query.plan;
    const businesses = await Business.find(filter).sort({ createdAt: -1 }).select('-password');
    res.json({ businesses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/pool — Phone number pool
router.get('/pool', async (req, res) => {
  try {
    const numbers = await PhoneNumber.find().sort({ addedAt: -1 }).populate('businessId', 'name email');
    const stats   = await getPoolStats();
    res.json({ numbers, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/pool/add — Add number to pool
router.post('/pool/add', async (req, res) => {
  const { number, sid } = req.body;
  if (!number) return res.status(400).json({ error: 'number required' });
  const result = await addNumberToPool(number, sid || '');
  res.json(result);
});

// POST /admin/pool/sync — Sync all numbers from Twilio
router.post('/pool/sync', async (req, res) => {
  const result = await syncFromTwilio();
  res.json(result);
});

// POST /admin/assign — Manually assign number to business
router.post('/assign', async (req, res) => {
  const { businessId, number } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });

  try {
    if (number) {
      // Assign specific number
      const phoneDoc = await PhoneNumber.findOneAndUpdate(
        { number, isAssigned: false },
        { isAssigned: true, businessId, assignedAt: new Date() },
        { new: true }
      );
      if (!phoneDoc) return res.status(400).json({ error: 'Number not available or not in pool' });
      await Business.findByIdAndUpdate(businessId, { twilioNumber: number, numberAssigned: true });
      res.json({ success: true, number });
    } else {
      // Auto-assign next available
      const result = await assignNumberToBusiness(businessId);
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/release — Release number back to pool
router.post('/release', async (req, res) => {
  const { businessId } = req.body;
  const result = await releaseNumber(businessId);
  res.json(result);
});

// PATCH /admin/business — Update plan, status etc.
router.patch('/business', async (req, res) => {
  const { businessId, ...updates } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });
  try {
    const business = await Business.findByIdAndUpdate(businessId, updates, { new: true }).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/business/:id — Business detail
router.get('/business/:id', async (req, res) => {
  try {
    const [business, appointments, customers, calls] = await Promise.all([
      Business.findById(req.params.id).select('-password'),
      Appointment.countDocuments({ businessId: req.params.id }),
      Customer.countDocuments({ businessId: req.params.id }),
      CallLog.countDocuments({ businessId: req.params.id }),
    ]);
    res.json({ business, stats: { appointments, customers, calls } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
