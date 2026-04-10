// ============================================================
//  ARIA Platform — Settings & Phone Number Route
// ============================================================

const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');
const { Business, Customer, Appointment } = require('../models');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// GET business settings
router.get('/settings', async (req, res) => {
  try {
    const business = await Business.findById(req.business.id).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update settings including phone number
router.patch('/settings', async (req, res) => {
  try {
    const { twilioNumber, ...rest } = req.body;

    // If twilioNumber is being set, connect webhook automatically
    if (twilioNumber && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const backendUrl = process.env.BACKEND_URL || 'https://aria-business.onrender.com';

        // Update Twilio webhook for this number
        const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: twilioNumber });
        if (numbers.length > 0) {
          await client.incomingPhoneNumbers(numbers[0].sid).update({
            voiceUrl:    `${backendUrl}/voice/incoming`,
            voiceMethod: 'POST',
            statusCallback:       `${backendUrl}/voice/status`,
            statusCallbackMethod: 'POST',
          });
        }
      } catch (twilioErr) {
        console.error('Twilio webhook update error:', twilioErr.message);
      }
    }

    const business = await Business.findByIdAndUpdate(
      req.business.id,
      { $set: { ...rest, ...(twilioNumber ? { twilioNumber } : {}) } },
      { new: true }
    ).select('-password');

    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find({ businessId: req.business.id })
      .sort({ createdAt: -1 }).limit(100);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const { format } = require('date-fns');
    const today = format(new Date(), 'yyyy-MM-dd');
    const bId = req.business.id;

    const [todayCount, upcomingCount, totalCount, cancelledCount, totalCustomers] = await Promise.all([
      Appointment.countDocuments({ businessId: bId, date: today, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ businessId: bId, date: { $gt: today }, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ businessId: bId, status: 'confirmed' }),
      Appointment.countDocuments({ businessId: bId, status: 'cancelled' }),
      Customer.countDocuments({ businessId: bId }),
    ]);

    res.json({ todayCount, upcomingCount, totalCount, cancelledCount, totalCustomers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
