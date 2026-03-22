// ============================================================
//  ARIA Business OS — Notification Service
//  Sends WhatsApp and SMS via Twilio
// ============================================================

const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_PHONE     = process.env.TWILIO_PHONE_NUMBER;
const FROM_WHATSAPP  = process.env.TWILIO_WHATSAPP_NUMBER;
const BUSINESS_NAME  = process.env.BUSINESS_NAME || 'ARIA Business';

// ── Send WhatsApp message ─────────────────────────────────────
async function sendWhatsApp(to, message) {
  try {
    const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    await client.messages.create({
      from: FROM_WHATSAPP,
      to:   toWhatsApp,
      body: message,
    });
    console.log('WhatsApp sent to', to);
    return true;
  } catch (err) {
    console.error('WhatsApp error:', err.message);
    return false;
  }
}

// ── Send SMS ──────────────────────────────────────────────────
async function sendSMS(to, message) {
  try {
    await client.messages.create({
      from: FROM_PHONE,
      to:   to,
      body: message,
    });
    console.log('SMS sent to', to);
    return true;
  } catch (err) {
    console.error('SMS error:', err.message);
    return false;
  }
}

// ── Appointment confirmation ──────────────────────────────────
async function sendConfirmation(appointment) {
  const msg = `Hi ${appointment.customerName}! ✅\n\nYour appointment is confirmed:\n📅 Date: ${appointment.date}\n⏰ Time: ${appointment.time}\n💼 Service: ${appointment.service}\n\nNeed to reschedule? Call us or reply here.\n\n— ${BUSINESS_NAME}`;

  await sendWhatsApp(appointment.customerPhone, msg);
  return true;
}

// ── Appointment reminder ──────────────────────────────────────
async function sendReminder(appointment) {
  const msg = `Hi ${appointment.customerName}! 👋\n\nReminder: You have an appointment tomorrow!\n📅 Date: ${appointment.date}\n⏰ Time: ${appointment.time}\n💼 Service: ${appointment.service}\n\nSee you soon!\n— ${BUSINESS_NAME}`;

  await sendWhatsApp(appointment.customerPhone, msg);
  return true;
}

// ── Cancellation notice ───────────────────────────────────────
async function sendCancellation(appointment) {
  const msg = `Hi ${appointment.customerName},\n\nYour appointment on ${appointment.date} at ${appointment.time} has been cancelled.\n\nTo rebook, please call us or visit our website.\n\n— ${BUSINESS_NAME}`;

  await sendWhatsApp(appointment.customerPhone, msg);
  return true;
}

module.exports = {
  sendWhatsApp,
  sendSMS,
  sendConfirmation,
  sendReminder,
  sendCancellation,
};
