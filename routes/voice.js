// ============================================================
//  ARIA Business OS — Voice Call Routes (Twilio Webhooks)
// ============================================================

const express  = require('express');
const router   = express.Router();
const twilio   = require('twilio');
const { chat } = require('../services/aiService');
const { sendConfirmation } = require('../services/notificationService');
const { CallLog } = require('../models');

const VoiceResponse = twilio.twiml.VoiceResponse;

// Store call sessions in memory (use Redis in production)
const callSessions = {};

// POST /voice/incoming — Twilio calls this when someone calls your number
router.post('/incoming', async (req, res) => {
  const twiml    = new VoiceResponse();
  const callSid  = req.body.CallSid;
  const callerPhone = req.body.From || '';

  // Initialize session
  callSessions[callSid] = {
    messages: [],
    callerPhone,
    startTime: Date.now(),
  };

  // Get business greeting
  const greeting = process.env.GREETING || `Thank you for calling ${process.env.BUSINESS_NAME || 'us'}. I'm ARIA, your AI assistant. How can I help you today?`;

  // Speak greeting and listen
  const gather = twiml.gather({
    input:        'speech',
    action:       `/voice/respond?callSid=${callSid}`,
    method:       'POST',
    language:     'en-IN',
    speechTimeout: 'auto',
    timeout:       5,
  });
  gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, greeting);

  // If no input
  twiml.redirect('/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /voice/respond — Handles each turn of the conversation
router.post('/respond', async (req, res) => {
  const twiml   = new VoiceResponse();
  const callSid = req.query.callSid;
  const speech  = req.body.SpeechResult || '';

  const session = callSessions[callSid] || { messages: [], callerPhone: req.body.From || '' };

  // Add user message
  session.messages.push({ role: 'user', content: speech });

  try {
    const { reply, action, actionResult } = await chat(session.messages, session.callerPhone);

    // Add AI response to session
    session.messages.push({ role: 'assistant', content: reply });
    callSessions[callSid] = session;

    // Send WhatsApp confirmation if appointment was booked
    if (action?.action === 'book' && actionResult?.success) {
      sendConfirmation(actionResult.appointment).catch(console.error);
    }

    // Speak the reply and listen for next input
    const gather = twiml.gather({
      input:         'speech',
      action:        `/voice/respond?callSid=${callSid}`,
      method:        'POST',
      language:      'en-IN',
      speechTimeout: 'auto',
      timeout:        5,
    });
    gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, reply);

    // If caller stops talking, ask again
    twiml.say({ voice: 'Polly.Aditi', language: 'en-IN' }, 'Are you still there? Is there anything else I can help you with?');
    twiml.gather({
      input:  'speech',
      action: `/voice/respond?callSid=${callSid}`,
      method: 'POST',
    });

  } catch (err) {
    console.error('AI error during call:', err.message);
    twiml.say({ voice: 'Polly.Aditi' }, 'I apologize, I am having trouble right now. Please call back in a moment.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /voice/status — Twilio calls this when call ends
router.post('/status', async (req, res) => {
  const callSid  = req.body.CallSid;
  const duration = parseInt(req.body.CallDuration) || 0;
  const session  = callSessions[callSid];

  if (session) {
    // Save call log to database
    await CallLog.create({
      callSid,
      callerPhone:  session.callerPhone,
      duration,
      transcript:   session.messages,
      outcome:      session.messages.length > 2 ? 'query_answered' : 'other',
    }).catch(console.error);

    delete callSessions[callSid];
  }

  res.sendStatus(200);
});

module.exports = router;
