// ============================================================
//  ARIA Platform — Phone Number Service
//  Manages pool of Twilio numbers, auto-assigns to businesses
// ============================================================

const twilio = require('twilio');
const { PhoneNumber, Business } = require('../models');

const BACKEND_URL = process.env.BACKEND_URL || 'https://aria-business.onrender.com';

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Add a number to the pool ──────────────────────────────────
async function addNumberToPool(number, sid = '') {
  try {
    const existing = await PhoneNumber.findOne({ number });
    if (existing) return { success: false, message: 'Number already in pool' };
    await PhoneNumber.create({ number, sid, isAssigned: false });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Auto-assign next available number to a business ───────────
async function assignNumberToBusiness(businessId) {
  try {
    // Find next available number
    const phoneNumber = await PhoneNumber.findOneAndUpdate(
      { isAssigned: false },
      { isAssigned: true, businessId, assignedAt: new Date() },
      { new: true }
    );

    if (!phoneNumber) {
      return { success: false, message: 'No phone numbers available in pool. Please add more numbers.' };
    }

    // Update Twilio webhook for this number
    const client = getTwilioClient();
    if (client && phoneNumber.sid) {
      try {
        await client.incomingPhoneNumbers(phoneNumber.sid).update({
          voiceUrl:            `${BACKEND_URL}/voice/incoming`,
          voiceMethod:         'POST',
          statusCallback:      `${BACKEND_URL}/voice/status`,
          statusCallbackMethod:'POST',
        });
      } catch (twilioErr) {
        console.error('Twilio webhook update failed:', twilioErr.message);
      }
    }

    // Update business with the assigned number
    await Business.findByIdAndUpdate(businessId, {
      twilioNumber:   phoneNumber.number,
      twilioNumberSid:phoneNumber.sid,
      numberAssigned: true,
    });

    console.log(`Number ${phoneNumber.number} assigned to business ${businessId}`);
    return { success: true, number: phoneNumber.number };

  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Release number back to pool ───────────────────────────────
async function releaseNumber(businessId) {
  try {
    const business = await Business.findById(businessId);
    if (!business?.twilioNumber) return { success: false, message: 'No number to release' };

    await PhoneNumber.findOneAndUpdate(
      { number: business.twilioNumber },
      { isAssigned: false, businessId: null, assignedAt: null }
    );

    await Business.findByIdAndUpdate(businessId, {
      twilioNumber: '',
      twilioNumberSid: '',
      numberAssigned: false,
    });

    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Get pool stats ────────────────────────────────────────────
async function getPoolStats() {
  const total    = await PhoneNumber.countDocuments();
  const assigned = await PhoneNumber.countDocuments({ isAssigned: true });
  const available= total - assigned;
  return { total, assigned, available };
}

// ── Sync numbers from Twilio account ─────────────────────────
async function syncFromTwilio() {
  const client = getTwilioClient();
  if (!client) return { success: false, message: 'Twilio not configured' };

  try {
    const numbers = await client.incomingPhoneNumbers.list();
    let added = 0;
    for (const num of numbers) {
      const existing = await PhoneNumber.findOne({ number: num.phoneNumber });
      if (!existing) {
        await PhoneNumber.create({ number: num.phoneNumber, sid: num.sid, isAssigned: false });
        added++;
      }
    }
    return { success: true, added, total: numbers.length };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  addNumberToPool,
  assignNumberToBusiness,
  releaseNumber,
  getPoolStats,
  syncFromTwilio,
};
