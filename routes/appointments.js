// ============================================================
//  ARIA Business OS — Appointment Routes
// ============================================================

const express = require('express');
const router  = express.Router();
const { Appointment, Customer } = require('../models');
const { sendConfirmation, sendCancellation } = require('../services/notificationService');
const { format } = require('date-fns');

// GET all appointments (with optional date filter)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.date)   filter.date   = req.query.date;
    if (req.query.status) filter.status = req.query.status;

    const appointments = await Appointment.find(filter)
      .sort({ date: 1, time: 1 })
      .limit(200);

    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET today's appointments
router.get('/today', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const appointments = await Appointment.find({ date: today, status: { $ne: 'cancelled' } })
      .sort({ time: 1 });
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET upcoming appointments
router.get('/upcoming', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const appointments = await Appointment.find({
      date: { $gte: today },
      status: { $ne: 'cancelled' }
    }).sort({ date: 1, time: 1 }).limit(50);
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create appointment manually
router.post('/', async (req, res) => {
  try {
    const { customerName, customerPhone, service, date, time, notes } = req.body;

    let customer = await Customer.findOne({ phone: customerPhone });
    if (!customer) {
      customer = await Customer.create({
        name: customerName,
        phone: customerPhone,
        whatsapp: customerPhone,
      });
    }

    const appointment = await Appointment.create({
      customer: customer._id,
      customerName,
      customerPhone,
      service,
      date,
      time,
      notes: notes || '',
      status: 'confirmed',
      createdBy: 'dashboard',
    });

    await sendConfirmation(appointment);
    res.json({ appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update appointment status
router.patch('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (req.body.status === 'cancelled') {
      await sendCancellation(appointment);
    }

    res.json({ appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE appointment
router.delete('/:id', async (req, res) => {
  try {
    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats for dashboard
router.get('/stats/summary', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');

    const [todayCount, upcomingCount, totalCount, cancelledCount] = await Promise.all([
      Appointment.countDocuments({ date: today, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ date: { $gt: today }, status: { $ne: 'cancelled' } }),
      Appointment.countDocuments({ status: 'confirmed' }),
      Appointment.countDocuments({ status: 'cancelled' }),
    ]);

    const totalCustomers = await Customer.countDocuments();

    res.json({ todayCount, upcomingCount, totalCount, cancelledCount, totalCustomers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

