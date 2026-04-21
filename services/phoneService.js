// ============================================================
//  ARIA Business Platform — Phone Service (Vapi)
//  Manages phone numbers via Vapi.ai instead of Twilio
// ============================================================

const { PhoneNumber, Business } = require('../models');
const { createVapiAssistant, updateVapiAssistant, deleteVapiAssistant } = require('./vapiService');

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const BACKEND_URL  = process.env.BACKEND_URL || 'https://aria-business-platform.up.railway.app';

// ── Get all Vapi phone numbers ────────────────────────────────
async function getVapiNumbers() {
  if (!VAPI_API_KEY) return [];
  try {
    const r = await fetch('https://api.vapi.ai/phone-number', {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Sync Vapi numbers to pool ─────────────────────────────────
async function syncFromVapi() {
  try {
    const numbers = await getVapiNumbers();
    let added = 0;
    for (const num of numbers) {
      const existing = await PhoneNumber.findOne({ number: num.number });
      if (!existing) {
        await PhoneNumber.create({
          number:     num.number,
          sid:        num.id, // Vapi uses id not sid
          isAssigned: false,
          provider:   'vapi',
        });
        added++;
      }
    }
    return { success: true, added, total: numbers.length };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Also sync Twilio numbers ──────────────────────────────────
async function syncFromTwilio() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return syncFromVapi();
  }
  try {
    const twilio  = require('twilio');
    const client  = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const numbers = await client.incomingPhoneNumbers.list();
    let added = 0;
    for (const num of numbers) {
      const existing = await PhoneNumber.findOne({ number: num.phoneNumber });
      if (!existing) {
        await PhoneNumber.create({ number: num.phoneNumber, sid: num.sid, isAssigned: false, provider: 'twilio' });
        added++;
      }
    }
    // Also sync Vapi numbers
    const vapiResult = await syncFromVapi();
    return { success: true, added: added + (vapiResult.added || 0), total: numbers.length };
  } catch (err) {
    return syncFromVapi();
  }
}

// ── Assign number + create Vapi assistant ────────────────────
async function assignNumberToBusiness(businessId) {
  try {
    // Find next available number
    const phoneNumber = await PhoneNumber.findOneAndUpdate(
      { isAssigned: false },
      { isAssigned: true, businessId, assignedAt: new Date() },
      { new: true }
    );

    if (!phoneNumber) {
      return { success: false, message: 'No phone numbers available. Admin needs to add more numbers.' };
    }

    // Get business details
    const business = await Business.findById(businessId);
    if (!business) return { success: false, message: 'Business not found' };

    // Create Vapi assistant for this business
    let vapiAssistantId = null;
    try {
      const assistant = await createVapiAssistant(business);
      vapiAssistantId = assistant.id;
      console.log(`✅ Vapi assistant created: ${vapiAssistantId}`);

      // Connect the phone number to this assistant in Vapi
      if (phoneNumber.sid && phoneNumber.provider === 'vapi') {
        await fetch(`https://api.vapi.ai/phone-number/${phoneNumber.sid}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VAPI_API_KEY}` },
          body: JSON.stringify({ assistantId: vapiAssistantId }),
        });
      } else if (phoneNumber.sid && phoneNumber.provider === 'twilio') {
        // Connect Twilio number to Vapi
        await connectTwilioNumberToVapi(phoneNumber.number, phoneNumber.sid, vapiAssistantId);
      }
    } catch (vapiErr) {
      console.error('Vapi assistant creation error:', vapiErr.message);
    }

    // Update business
    await Business.findByIdAndUpdate(businessId, {
      twilioNumber:     phoneNumber.number,
      numberAssigned:   true,
      vapiAssistantId,
    });

    console.log(`✅ Number ${phoneNumber.number} assigned to ${business.name}`);
    return { success: true, number: phoneNumber.number, assistantId: vapiAssistantId };

  } catch (err) {
    console.error('assignNumberToBusiness error:', err.message);
    return { success: false, message: err.message };
  }
}

// ── Connect Twilio number to Vapi ─────────────────────────────
async function connectTwilioNumberToVapi(number, sid, assistantId) {
  if (!VAPI_API_KEY) return false;
  try {
    // Import the number into Vapi
    const r = await fetch('https://api.vapi.ai/phone-number', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VAPI_API_KEY}` },
      body: JSON.stringify({
        provider:        'twilio',
        number,
        twilioAccountSid:  process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken:   process.env.TWILIO_AUTH_TOKEN,
        assistantId,
        name: `ARIA - ${number}`,
      }),
    });
    const data = await r.json();
    console.log('Twilio number connected to Vapi:', data.id || data.message);
    return data.id || false;
  } catch (err) {
    console.error('connectTwilioNumberToVapi error:', err.message);
    return false;
  }
}

// ── Manually assign specific number ──────────────────────────
async function assignSpecificNumber(businessId, number) {
  try {
    const business = await Business.findById(businessId);
    if (!business) return { success: false, message: 'Business not found' };

    // Create Vapi assistant
    let vapiAssistantId = null;
    try {
      const assistant = await createVapiAssistant(business);
      vapiAssistantId = assistant.id;
    } catch (e) {
      console.error('Vapi error:', e.message);
    }

    // Add to pool and assign
    let phoneDoc = await PhoneNumber.findOne({ number });
    if (!phoneDoc) {
      phoneDoc = await PhoneNumber.create({ number, isAssigned: true, businessId, assignedAt: new Date() });
    } else {
      await PhoneNumber.findByIdAndUpdate(phoneDoc._id, { isAssigned: true, businessId, assignedAt: new Date() });
    }

    // Try to connect to Vapi
    if (vapiAssistantId) {
      await connectTwilioNumberToVapi(number, phoneDoc.sid, vapiAssistantId);
    }

    await Business.findByIdAndUpdate(businessId, {
      twilioNumber: number, numberAssigned: true, vapiAssistantId,
    });

    return { success: true, number, assistantId: vapiAssistantId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Release number back to pool ───────────────────────────────
async function releaseNumber(businessId) {
  try {
    const business = await Business.findById(businessId);
    if (!business) return { success: false, message: 'Business not found' };

    // Delete Vapi assistant
    if (business.vapiAssistantId) {
      await deleteVapiAssistant(business.vapiAssistantId).catch(console.error);
    }

    // Release number
    if (business.twilioNumber) {
      await PhoneNumber.findOneAndUpdate(
        { number: business.twilioNumber },
        { isAssigned: false, businessId: null, assignedAt: null }
      );
    }

    await Business.findByIdAndUpdate(businessId, {
      twilioNumber: '', numberAssigned: false, vapiAssistantId: null,
    });

    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Update Vapi assistant when business settings change ───────
async function updateBusinessAssistant(businessId) {
  try {
    const business = await Business.findById(businessId);
    if (!business?.vapiAssistantId) return { success: false };
    await updateVapiAssistant(business.vapiAssistantId, business);
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
  syncFromVapi,
  assignNumberToBusiness,
  assignSpecificNumber,
  releaseNumber,
  updateBusinessAssistant,
  getPoolStats,
};

