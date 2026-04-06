// ============================================================
//  ARIA Platform — Voice Routes (Multi-tenant)
//  Each business has their own Twilio number
// ============================================================

const express  = require('express');
const router   = express.Router();
const twilio   = require('twilio');
const { chat } = require('../services/aiService');
const { sendConfirmation } = require('../services/notificationService');
const { CallLog, Business } = require('../models');

const VoiceResponse = twilio.twiml.VoiceResponse;
const callSessions  = {};

// POST /voice/incoming — Twilio calls this when someone calls
router.post('/incoming', async (req, res) => {
  const twiml       = new VoiceResponse();
  const callSid     = req.body.CallSid;
  const callerPhone = req.body.From || '';
  const calledNumber = req.body.To || '';

  // Find which business owns this Twilio number
  const business = await Business.findOne({ twilioNumber: calledNumber });

  if (!business) {
    twiml.say('Sorry, this number is not configured. Please contact support.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Initialize session
  callSessions[callSid] = {
    messages: [],
    callerPhone,
    businessId: business._id.toString(),
    startTime: Date.now(),
  };

  const greeting = business.greeting || `Thank you for calling ${business.name}. I am ${business.agentName || 'ARIA'}, your AI assistant. How can I help you today?`;

  const gather = twiml.gather({
    input:         'speech',
    action:        `/voice/respond?callSid=${callSid}`,
    method:        'POST',
    language:      business.language || 'en-IN',
    speechTimeout: 'auto',
    timeout:        5,
  });
  gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, greeting);
  twiml.redirect('/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /voice/respond — Each turn of conversation
router.post('/respond', async (req, res) => {
  const twiml   = new VoiceResponse();
  const callSid = req.query.callSid;
  const speech  = req.body.SpeechResult || '';

  const session = callSessions[callSid];
  if (!session) {
    twiml.say('Sorry, something went wrong. Please call again.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  session.messages.push({ role: 'user', content: speech });

  try {
    const { reply, action, actionResult } = await chat(session.messages, session.callerPhone, session.businessId);
    session.messages.push({ role: 'assistant', content: reply });
    callSessions[callSid] = session;

    if (action?.action === 'book' && actionResult?.success) {
      sendConfirmation(actionResult.appointment).catch(console.error);
    }

    const business = await Business.findById(session.businessId);
    const lang = business?.language || 'en-IN';

    const gather = twiml.gather({
      input:         'speech',
      action:        `/voice/respond?callSid=${callSid}`,
      method:        'POST',
      language:      lang,
      speechTimeout: 'auto',
      timeout:        5,
    });
    gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, reply);
    twiml.say({ voice: 'Polly.Aditi' }, 'Is there anything else I can help you with?');
    twiml.gather({ input: 'speech', action: `/voice/respond?callSid=${callSid}`, method: 'POST' });

  } catch (err) {
    console.error('AI error during call:', err.message);
    twiml.say({ voice: 'Polly.Aditi' }, 'I apologize, I am having trouble. Please call back in a moment.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /voice/status — Call ended
router.post('/status', async (req, res) => {
  const callSid  = req.body.CallSid;
  const duration = parseInt(req.body.CallDuration) || 0;
  const session  = callSessions[callSid];

  if (session) {
    await CallLog.create({
      businessId:  session.businessId,
      callSid,
      callerPhone: session.callerPhone,
      duration,
      transcript:  session.messages,
      outcome:     session.messages.length > 2 ? 'query_answered' : 'other',
    }).catch(console.error);
    delete callSessions[callSid];
  }

  res.sendStatus(200);
});

module.exports = router;
