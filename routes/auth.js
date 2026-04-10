// ============================================================
//  ARIA Platform — Auth Routes
// ============================================================

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Business } = require('../models');
const { assignNumberToBusiness } = require('../services/phoneService');
const { sendWelcomeWhatsApp } = require('../services/notificationService');

const JWT_SECRET = process.env.JWT_SECRET || 'aria-secret';

// ── Auth middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.business = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

  try {
    const existing = await Business.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed  = await bcrypt.hash(password, 10);
    const business = await Business.create({
      name, email, phone: phone || '',
      password: hashed,
      services: [
        { name: 'Consultation', duration: 30, price: 500 },
        { name: 'Full Service',  duration: 60, price: 1000 },
      ],
      greeting: `Thank you for calling ${name}. I am ARIA, your AI assistant. How can I help you today?`,
    });

    // Auto-assign a phone number from pool
    const numberResult = await assignNumberToBusiness(business._id);
    if (numberResult.success) {
      console.log(`Auto-assigned ${numberResult.number} to ${name}`);
    } else {
      console.log(`No numbers available for ${name} — admin needs to add more`);
    }

    // Send welcome WhatsApp if phone provided
    if (phone) {
      sendWelcomeWhatsApp(phone, name, numberResult.number).catch(console.error);
    }

    const token = jwt.sign(
      { id: business._id, email: business.email, name: business.name },
      JWT_SECRET, { expiresIn: '30d' }
    );

    // Reload business to get assigned number
    const updatedBusiness = await Business.findById(business._id).select('-password');

    res.json({
      token,
      business: {
        id:           updatedBusiness._id,
        name:         updatedBusiness.name,
        email:        updatedBusiness.email,
        plan:         updatedBusiness.plan,
        twilioNumber: updatedBusiness.twilioNumber,
        numberAssigned: updatedBusiness.numberAssigned,
      },
      numberAssigned: numberResult.success,
      phoneNumber:    numberResult.number || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const business = await Business.findOne({ email });
    if (!business) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, business.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    if (!business.isActive) return res.status(403).json({ error: 'Account suspended. Please contact support.' });

    const token = jwt.sign(
      { id: business._id, email: business.email, name: business.name },
      JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      token,
      business: {
        id:           business._id,
        name:         business.name,
        email:        business.email,
        plan:         business.plan,
        twilioNumber: business.twilioNumber,
        numberAssigned: business.numberAssigned,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const business = await Business.findById(req.business.id).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /auth/settings
router.patch('/settings', authMiddleware, async (req, res) => {
  try {
    const business = await Business.findByIdAndUpdate(
      req.business.id,
      { $set: req.body },
      { new: true }
    ).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, authMiddleware };
