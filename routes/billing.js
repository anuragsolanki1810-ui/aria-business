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
  starter: { price: 200000, name: 'Starter Plan', calls: 500  },
  growth:  { price: 400000, name: 'Growth Plan',  calls: 2000 },
  pro:     { price: 800000, name: 'Pro Plan',      calls: -1   },
};

// GET /billing/plans
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      { id:'starter', name:'Starter', price:2000, calls:'500 calls/month',   features:['AI voice receptionist','Appointment booking','WhatsApp confirmations','Business dashboard'] },
      { id:'growth',  name:'Growth',  price:4000, calls:'2,000 calls/month', features:['Everything in Starter','WhatsApp reminders','Hindi + English','Priority support','Custom personality'] },
      { id:'pro',     name:'Pro',     price:8000, calls:'Unlimited calls',   features:['Everything in Growth','Custom voice','Advanced analytics','API access','Dedicated support'] },
    ]
  });
});

// POST /billing/create-order
router.post('/create-order', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!RAZORPAY_KEY_ID) return res.status(400).json({ error: 'Billing not configured yet. Please contact support.' });

  try {
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

    const order = await razorpay.orders.create({
      amount:   PLANS[plan].price,
      currency: 'INR',
      receipt:  `aria_${req.business.id}_${plan}_${Date.now()}`,
      notes:    { businessId: req.business.id, plan },
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

// POST /billing/verify
router.post('/verify', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

  try {
    const sign        = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign= crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(sign).digest('hex');

    if (expectedSign !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const business = await Business.findByIdAndUpdate(
      req.business.id,
      { plan, isActive: true, lastPaymentAt: new Date() },
      { new: true }
    ).select('-password');

    res.json({ success: true, business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
