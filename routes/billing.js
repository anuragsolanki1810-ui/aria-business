// ============================================================
//  ARIA Platform — Billing Routes (Razorpay)
// ============================================================

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { Business } = require('../models');
const { authMiddleware } = require('./auth');

const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const PLANS = {
  starter: { price: 200000, name: 'Starter Plan' },  // ₹2,000 in paise
  growth:  { price: 400000, name: 'Growth Plan'  },  // ₹4,000 in paise
  pro:     { price: 800000, name: 'Pro Plan'     },  // ₹8,000 in paise
};

// POST /billing/create-order — Create Razorpay order
router.post('/create-order', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!RAZORPAY_KEY_ID) return res.status(500).json({ error: 'Razorpay not configured' });

  try {
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

    const order = await razorpay.orders.create({
      amount:   PLANS[plan].price,
      currency: 'INR',
      receipt:  `aria_${req.business.id}_${plan}_${Date.now()}`,
      notes: {
        businessId: req.business.id,
        plan,
      },
    });

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    RAZORPAY_KEY_ID,
      plan,
      planName: PLANS[plan].name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /billing/verify — Verify payment and upgrade plan
router.post('/verify', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

  try {
    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(sign).digest('hex');

    if (expectedSign !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Upgrade business plan
    const business = await Business.findByIdAndUpdate(
      req.business.id,
      { plan, isActive: true },
      { new: true }
    ).select('-password');

    res.json({ success: true, business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /billing/plans — Get plan details
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      { id: 'starter', name: 'Starter', price: 2000, features: ['AI voice receptionist', '500 calls/month', 'Appointment booking', 'WhatsApp confirmations', 'Business dashboard'] },
      { id: 'growth',  name: 'Growth',  price: 4000, features: ['Everything in Starter', '2,000 calls/month', 'WhatsApp reminders', 'Hindi + English voice', 'Priority support', 'Custom personality'] },
      { id: 'pro',     name: 'Pro',     price: 8000, features: ['Everything in Growth', 'Unlimited calls', 'Custom voice', 'Advanced analytics', 'API access', 'Dedicated support'] },
    ]
  });
});

module.exports = router;
