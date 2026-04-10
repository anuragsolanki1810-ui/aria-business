// ============================================================
//  ARIA Platform — Notification Service
//  WhatsApp + SMS via Twilio
// ============================================================

const twilio = require('twilio');

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const FROM_WHATSAPP = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const FROM_SMS      = process.env.TWILIO_PHONE_NUMBER;

// ── Send WhatsApp ─────────────────────────────────────────────
async function sendWhatsApp(to, message) {
  const client = getClient();
  if (!client) { console.log('WhatsApp (no Twilio):', message); return false; }
  try {
    const toWA = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    await client.messages.create({ from: FROM_WHATSAPP, to: toWA, body: message });
    return true;
  } catch (err) {
    console.error('WhatsApp error:', err.message);
    return false;
  }
}

// ── Send SMS ──────────────────────────────────────────────────
async function sendSMS(to, message) {
  const client = getClient();
  if (!client || !FROM_SMS) { console.log('SMS (no Twilio):', message); return false; }
  try {
    await client.messages.create({ from: FROM_SMS, to, body: message });
    return true;
  } catch (err) {
    console.error('SMS error:', err.message);
    return false;
  }
}

// ── Appointment confirmation ──────────────────────────────────
async function sendConfirmation(appointment, businessName = 'the business') {
  const msg = `Hi ${appointment.customerName}! ✅\n\nYour appointment is confirmed:\n📅 ${appointment.date}\n⏰ ${appointment.time}\n💼 ${appointment.service}\n\nNeed to reschedule? Just call us.\n\n— ${businessName}`;
  return sendWhatsApp(appointment.customerPhone, msg);
}

// ── Appointment reminder ──────────────────────────────────────
async function sendReminder(appointment, businessName = 'the business') {
  const msg = `Hi ${appointment.customerName}! 👋\n\nReminder: You have an appointment tomorrow!\n📅 ${appointment.date}\n⏰ ${appointment.time}\n💼 ${appointment.service}\n\nSee you soon!\n— ${businessName}`;
  return sendWhatsApp(appointment.customerPhone, msg);
}

// ── Cancellation ──────────────────────────────────────────────
async function sendCancellation(appointment, businessName = 'the business') {
  const msg = `Hi ${appointment.customerName},\n\nYour appointment on ${appointment.date} at ${appointment.time} has been cancelled.\n\nTo rebook, please call us.\n\n— ${businessName}`;
  return sendWhatsApp(appointment.customerPhone, msg);
}

// ── Welcome message to new business ──────────────────────────
async function sendWelcomeWhatsApp(phone, businessName, assignedNumber) {
  const numberText = assignedNumber
    ? `Your AI receptionist number is: ${assignedNumber}\nShare this with your customers — ARIA will answer their calls 24/7!`
    : `Your AI receptionist is being set up. You will receive your phone number shortly.`;

  const msg = `Welcome to ARIA Platform! 🎉\n\nHi ${businessName},\n\n${numberText}\n\nLogin to your dashboard to customize ARIA:\n🤖 Set your services\n🕐 Set working hours\n💬 Customize the greeting\n\nNeed help? Reply to this message.\n\n— ARIA Team`;

  return sendWhatsApp(phone, msg);
}

module.exports = {
  sendWhatsApp,
  sendSMS,
  sendConfirmation,
  sendReminder,
  sendCancellation,
  sendWelcomeWhatsApp,
};
