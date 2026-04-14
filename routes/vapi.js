// ============================================================
//  ARIA Business Platform — Vapi Webhook Route
//  Handles all events from Vapi during phone calls
// ============================================================

const express = require('express');
const router  = express.Router();
const { Business, Appointment, Customer, CallLog } = require('../models');
const { sendConfirmation } = require('../services/notificationService');

// ── Helper: extract action from AI message ────────────────────
function extractAction(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); }
  catch { return null; }
}

// ── Helper: execute booking action ───────────────────────────
async function executeAction(action, businessId, callerPhone) {
  const phone = action.phone || callerPhone;

  if (action.action === 'book') {
    let customer = await Customer.findOne({ businessId, phone });
    if (!customer) {
      customer = await Customer.create({
        businessId,
        name:     action.name || 'Unknown',
        phone,
        whatsapp: phone,
      });
    } else {
      customer.totalVisits += 1;
      await customer.save();
    }

    const appointment = await Appointment.create({
      businessId,
      customer:      customer._id,
      customerName:  action.name  || customer.name,
      customerPhone: phone,
      service:       action.service || 'General',
      date:          action.date,
      time:          action.time,
      notes:         action.notes || '',
      createdBy:     'ai-agent',
    });

    // Send WhatsApp confirmation
    const business = await Business.findById(businessId).select('name');
    sendConfirmation(appointment, business?.name).catch(console.error);

    return { success: true, appointment };
  }

  if (action.action === 'cancel') {
    const appt = await Appointment.findOneAndUpdate(
      { businessId, customerPhone: phone, date: action.date, time: action.time },
      { status: 'cancelled' },
      { new: true }
    );
    return { success: !!appt };
  }

  if (action.action === 'reschedule') {
    const appt = await Appointment.findOneAndUpdate(
      { businessId, customerPhone: phone, date: action.old_date, time: action.old_time },
      { date: action.new_date, time: action.new_time, status: 'confirmed' },
      { new: true }
    );
    return { success: !!appt };
  }

  return { success: false };
}

// ── POST /vapi/webhook — Main webhook handler ─────────────────
router.post('/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.sendStatus(200);

  const { type, call, artifact } = message;

  try {
    // Get business from assistant ID
    const assistantId = call?.assistantId;
    const business = assistantId
      ? await Business.findOne({ vapiAssistantId: assistantId })
      : null;

    const businessId  = business?._id;
    const callerPhone = call?.customer?.number || '';

    // ── Call started ──────────────────────────────────────────
    if (type === 'call-started') {
      console.log(`📞 Call started for business: ${business?.name || 'Unknown'}`);
    }

    // ── Assistant message (check for booking action) ──────────
    if (type === 'transcript' && message.role === 'assistant') {
      const action = extractAction(message.transcript);
      if (action && businessId) {
        await executeAction(action, businessId, callerPhone);
      }
    }

    // ── Call ended ────────────────────────────────────────────
    if (type === 'end-of-call-report') {
      const transcript = artifact?.transcript || '';
      const duration   = call?.endedAt && call?.startedAt
        ? Math.floor((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
        : 0;

      // Check if appointment was booked from transcript
      const action = extractAction(transcript);
      let appointmentId = null;
      if (action?.action === 'book' && businessId) {
        const result = await executeAction(action, businessId, callerPhone);
        if (result.success) appointmentId = result.appointment?._id;
      }

      // Save call log
      if (businessId) {
        await CallLog.create({
          businessId,
          callSid:     call?.id,
          callerPhone,
          duration,
          transcript:  [{ role: 'transcript', content: transcript }],
          outcome:     appointmentId ? 'appointment_booked' : 'query_answered',
          appointmentId,
        });
      }

      console.log(`📞 Call ended — Duration: ${duration}s, Business: ${business?.name}`);
    }

    // ── Function call (for structured booking) ────────────────
    if (type === 'function-call') {
      const { name, parameters } = message.functionCall;
      if (name === 'bookAppointment' && businessId) {
        const result = await executeAction(
          { action: 'book', ...parameters },
          businessId,
          callerPhone
        );
        return res.json({ result: result.success ? 'Appointment booked successfully!' : 'Failed to book' });
      }
    }

  } catch (err) {
    console.error('Vapi webhook error:', err.message);
  }

  res.sendStatus(200);
});

// ── GET /vapi/calls/:businessId — Get call logs ───────────────
router.get('/calls/:businessId', async (req, res) => {
  try {
    const logs = await CallLog.find({ businessId: req.params.businessId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
