// ============================================================
//  ARIA Platform — Auth Routes
//  Business signup, login, JWT authentication
// ============================================================

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Business } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'aria-platform-secret';

// ── Middleware: verify JWT ────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.business = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /auth/signup — Register a new business
router.post('/signup', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  try {
    const existing = await Business.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const business = await Business.create({
      name,
      email,
      password: hashed,
      phone: phone || '',
      services: [
        { name: 'Consultation', duration: 30, price: 500 },
        { name: 'Full Service',  duration: 60, price: 1000 },
      ],
    });

    const token = jwt.sign(
      { id: business._id, email: business.email, name: business.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, business: { id: business._id, name: business.name, email: business.email, plan: business.plan } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login — Login existing business
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const business = await Business.findOne({ email });
    if (!business) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, business.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: business._id, email: business.email, name: business.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, business: { id: business._id, name: business.name, email: business.email, plan: business.plan } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me — Get current business info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const business = await Business.findById(req.business.id).select('-password');
    res.json({ business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /auth/settings — Update business settings
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
