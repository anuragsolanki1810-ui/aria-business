// ============================================================
//  ARIA Platform — Appointment Routes (Multi-tenant)
// ============================================================

const express = require('express');
const router  = express.Router();
const { Appointment, Customer } = require('../models');
const { sendConfirmation, sendCancellation } = require('../services/notificationService');
const { authMiddleware } = require('./auth');
const { format } = require('date-fns');

// All routes require auth
router.use(authMiddleware);

// GET all appointments
router.get('/', async (req, res) => {
  try {
    const filter = { businessId: req.business.id };
    if (req.query.date)   filter.date   = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 }).limit(200);
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET today's appointments
router.get('/today', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const appointments = await Appointment.find({
      businessId: req.business.id,
      date: today,
      status: { $ne: 'cancelled' }
    }).sort({ time: 1 });
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
router.get('/stats/summary', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const bId = req.business.id;
    const [todayCount, upcomingCount, totalCount, cancelledCount] = await Promise.all([
      Appointment.countDocuments({ businessId: bId, date: today, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ businessId: bId, date: { $gt: today }, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ businessId: bId, status: 'confirmed' }),
      Appointment.countDocuments({ businessId: bId, status: 'cancelled' }),
    ]);
    const totalCustomers = await Customer.countDocuments({ businessId: bId });
    res.json({ todayCount, upcomingCount, totalCount, cancelledCount, totalCustomers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create appointment
router.post('/', async (req, res) => {
  try {
    const { customerName, customerPhone, service, date, time, notes } = req.body;
    let customer = await Customer.findOne({ businessId: req.business.id, phone: customerPhone });
    if (!customer) {
      customer = await Customer.create({ businessId: req.business.id, name: customerName, phone: customerPhone, whatsapp: customerPhone });
    }
    const appointment = await Appointment.create({
      businessId: req.business.id,
      customer: customer._id,
      customerName, customerPhone, service, date, time,
      notes: notes || '', createdBy: 'dashboard',
    });
    await sendConfirmation(appointment);
    res.json({ appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update appointment
router.patch('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, businessId: req.business.id },
      req.body, { new: true }
    );
    if (req.body.status === 'cancelled') await sendCancellation(appointment);
    res.json({ appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE appointment
router.delete('/:id', async (req, res) => {
  try {
    await Appointment.findOneAndDelete({ _id: req.params.id, businessId: req.business.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

