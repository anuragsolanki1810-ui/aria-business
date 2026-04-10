// ============================================================
//  ARIA Platform — Admin Routes
//  Only you can access these with the admin key
// ============================================================

const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');
const { Business, Appointment, Customer, CallLog } = require('../models');

const ADMIN_KEY = process.env.ADMIN_KEY || 'aria-admin-2025';

// Admin auth middleware
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(adminAuth);

// GET /admin/stats — Platform overview
router.get('/stats', async (req, res) => {
  try {
    const [total, active, trial, starter, growth, pro, withNumbers] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true, plan: { $ne: 'trial' } }),
      Business.countDocuments({ plan: 'trial' }),
      Business.countDocuments({ plan: 'starter' }),
      Business.countDocuments({ plan: 'growth' }),
      Business.countDocuments({ plan: 'pro' }),
      Business.countDocuments({ twilioNumber: { $exists: true, $ne: '' } }),
    ]);

    const mrr = (starter * 2000) + (growth * 4000) + (pro * 8000);
    const recent = await Business.find().sort({ createdAt: -1 }).limit(5).select('-password');

    res.json({ stats: { total, active, trial, starter, growth, pro, withNumbers, mrr }, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/businesses — All businesses
router.get('/businesses', async (req, res) => {
  try {
    const filter = {};
    if (req.query.plan) filter.plan = req.query.plan;
    const businesses = await Business.find(filter)
      .sort({ createdAt: -1 })
      .select('-password');
    res.json({ businesses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/assign-number — Assign Twilio number to business
router.post('/assign-number', async (req, res) => {
  const { businessId, twilioNumber } = req.body;
  if (!businessId || !twilioNumber) return res.status(400).json({ error: 'businessId and twilioNumber required' });

  try {
    // Update Twilio webhook automatically
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const backendUrl = process.env.BACKEND_URL || 'https://aria-business.onrender.com';

      try {
        const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: twilioNumber });
        if (numbers.length > 0) {
          await client.incomingPhoneNumbers(numbers[0].sid).update({
            voiceUrl:    `${backendUrl}/voice/incoming`,
            voiceMethod: 'POST',
            statusCallback:       `${backendUrl}/voice/status`,
            statusCallbackMethod: 'POST',
          });
          console.log(`Webhook updated for ${twilioNumber}`);
        }
      } catch (twilioErr) {
        console.error('Twilio error:', twilioErr.message);
      }
    }

    await Business.findByIdAndUpdate(businessId, { twilioNumber });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admin/update-business — Update plan, status, etc.
router.patch('/update-business', async (req, res) => {
  const { businessId, ...updates } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });
  try {
    const business = await Business.findByIdAndUpdate(businessId, updates, { new: true }).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/business/:id — Get single business details
router.get('/business/:id', async (req, res) => {
  try {
    const business  = await Business.findById(req.params.id).select('-password');
    const appointments = await Appointment.countDocuments({ businessId: req.params.id });
    const customers    = await Customer.countDocuments({ businessId: req.params.id });
    const calls        = await CallLog.countDocuments({ businessId: req.params.id });
    res.json({ business, stats: { appointments, customers, calls } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
