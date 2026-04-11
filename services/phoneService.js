// ============================================================
//  ARIA Platform — Phone Number Service
//  Pool management + auto Twilio webhook connection
// ============================================================

const twilio = require('twilio');
const { PhoneNumber, Business } = require('../models');

const BACKEND_URL = process.env.BACKEND_URL || 'https://aria-business.onrender.com';

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Connect webhook on Twilio for a number ────────────────────
async function connectWebhook(numberSid) {
  const client = getClient();
  if (!client || !numberSid) return false;
  try {
    await client.incomingPhoneNumbers(numberSid).update({
      voiceUrl:             `${BACKEND_URL}/voice/incoming`,
      voiceMethod:          'POST',
      statusCallback:       `${BACKEND_URL}/voice/status`,
      statusCallbackMethod: 'POST',
    });
    console.log(`✅ Webhook connected for SID: ${numberSid}`);
    return true;
  } catch (err) {
    console.error('Twilio webhook error:', err.message);
    return false;
  }
}

// ── Sync ALL numbers from Twilio into pool ────────────────────
async function syncFromTwilio() {
  const client = getClient();
  if (!client) return { success: false, message: 'Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Render environment.' };

  try {
    const numbers = await client.incomingPhoneNumbers.list();
    let added = 0;

    for (const num of numbers) {
      const existing = await PhoneNumber.findOne({ number: num.phoneNumber });
      if (!existing) {
        await PhoneNumber.create({
          number:     num.phoneNumber,
          sid:        num.sid,
          isAssigned: false,
        });
        added++;
        console.log(`Added ${num.phoneNumber} to pool`);
      } else if (!existing.sid) {
        // Update SID if missing
        await PhoneNumber.findOneAndUpdate({ number: num.phoneNumber }, { sid: num.sid });
      }
    }

    return { success: true, added, total: numbers.length };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Auto-assign next available number ────────────────────────
async function assignNumberToBusiness(businessId) {
  try {
    // Find next available number in pool
    const phoneNumber = await PhoneNumber.findOneAndUpdate(
      { isAssigned: false },
      { isAssigned: true, businessId, assignedAt: new Date() },
      { new: true }
    );

    if (!phoneNumber) {
      console.log('⚠️  No numbers in pool! Admin needs to sync from Twilio or add numbers manually.');
      return { success: false, message: 'No phone numbers available. Contact support.' };
    }

    // Connect Twilio webhook for this number
    if (phoneNumber.sid) {
      await connectWebhook(phoneNumber.sid);
    } else {
      // Try to find the SID from Twilio
      const client = getClient();
      if (client) {
        try {
          const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: phoneNumber.number });
          if (numbers.length > 0) {
            await connectWebhook(numbers[0].sid);
            await PhoneNumber.findByIdAndUpdate(phoneNumber._id, { sid: numbers[0].sid });
          }
        } catch (e) {
          console.error('Could not find SID:', e.message);
        }
      }
    }

    // Update business
    await Business.findByIdAndUpdate(businessId, {
      twilioNumber:    phoneNumber.number,
      twilioNumberSid: phoneNumber.sid || '',
      numberAssigned:  true,
    });

    console.log(`✅ Number ${phoneNumber.number} assigned to business ${businessId}`);
    return { success: true, number: phoneNumber.number };

  } catch (err) {
    console.error('assignNumberToBusiness error:', err.message);
    return { success: false, message: err.message };
  }
}

// ── Manually assign a specific number ────────────────────────
async function assignSpecificNumber(businessId, number) {
  try {
    const client = getClient();
    let sid = '';

    // Get SID from Twilio
    if (client) {
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: number });
      if (numbers.length > 0) {
        sid = numbers[0].sid;
        await connectWebhook(sid);
      }
    }

    // Add to pool if not already there
    let phoneDoc = await PhoneNumber.findOne({ number });
    if (!phoneDoc) {
      phoneDoc = await PhoneNumber.create({ number, sid, isAssigned: true, businessId, assignedAt: new Date() });
    } else {
      await PhoneNumber.findByIdAndUpdate(phoneDoc._id, { isAssigned: true, businessId, assignedAt: new Date(), sid: sid || phoneDoc.sid });
    }

    // Update business
    await Business.findByIdAndUpdate(businessId, {
      twilioNumber:    number,
      twilioNumberSid: sid,
      numberAssigned:  true,
    });

    return { success: true, number };
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
      twilioNumber: '', twilioNumberSid: '', numberAssigned: false,
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
  return { total, assigned, available: total - assigned };
}

module.exports = {
  syncFromTwilio,
  assignNumberToBusiness,
  assignSpecificNumber,
  releaseNumber,
  getPoolStats,
  connectWebhook,
};
