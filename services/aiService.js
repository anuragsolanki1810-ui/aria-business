// ============================================================
//  ARIA Business OS — AI Service
//  Handles conversation logic with Groq AI
// ============================================================

const { Appointment, Customer, Business } = require('../models');
const { format, addDays, parseISO } = require('date-fns');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Build system prompt from business settings ───────────────
async function buildSystemPrompt() {
  let business;
  try {
    business = await Business.findOne();
  } catch (e) {}

  const name     = business?.agentName || process.env.BUSINESS_NAME || 'ARIA';
  const bizName  = business?.name      || process.env.BUSINESS_NAME || 'this business';
  const services = business?.services?.map(s => s.name).join(', ') || 'our services';

  const today = format(new Date(), 'EEEE, MMMM d yyyy');
  const tomorrow = format(addDays(new Date(), 1), 'EEEE, MMMM d yyyy');

  return `You are ${name}, the AI receptionist for ${bizName}.
Today is ${today}. Tomorrow is ${tomorrow}.

Your job:
1. Greet customers warmly
2. Book, reschedule or cancel appointments
3. Answer questions about services, hours, pricing
4. Take messages when needed

Available services: ${services}

When booking appointments, collect:
- Customer name
- Preferred date (today/tomorrow/specific date)
- Preferred time
- Service needed
- Phone number (if not already known)

IMPORTANT RULES:
- Keep responses SHORT — under 3 sentences. You are speaking on the phone.
- Be warm, professional, and efficient.
- When you have enough info to book, reply with JSON like:
  {"action":"book","name":"John","phone":"+91XXXXXXXXXX","service":"Haircut","date":"2025-04-10","time":"14:00","notes":""}
- When appointment is cancelled:
  {"action":"cancel","phone":"+91XXXXXXXXXX","date":"2025-04-10","time":"14:00"}
- For reschedule:
  {"action":"reschedule","phone":"+91XXXXXXXXXX","old_date":"2025-04-10","old_time":"14:00","new_date":"2025-04-11","new_time":"15:00"}
- Only include JSON when you have ALL required information.
- Speak in the customer's language if they use Hindi or another language.
- Never say you are an AI unless directly asked.`;
}

// ── Extract action from AI response ──────────────────────────
function extractAction(text) {
  const match = text.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ── Execute booking action ────────────────────────────────────
async function executeAction(action, callerPhone) {
  if (action.action === 'book') {
    const phone = action.phone || callerPhone;

    let customer = await Customer.findOne({ phone });
    if (!customer) {
      customer = await Customer.create({
        name:  action.name  || 'Unknown',
        phone: phone,
        whatsapp: phone,
      });
    } else {
      customer.totalVisits += 1;
      await customer.save();
    }

    const appointment = await Appointment.create({
      customer:      customer._id,
      customerName:  action.name  || customer.name,
      customerPhone: phone,
      service:       action.service || 'General',
      date:          action.date,
      time:          action.time,
      notes:         action.notes || '',
      status:        'confirmed',
      createdBy:     'ai-agent',
    });

    return { success: true, appointment, customer };
  }

  if (action.action === 'cancel') {
    const appt = await Appointment.findOneAndUpdate(
      { customerPhone: action.phone || callerPhone, date: action.date, time: action.time },
      { status: 'cancelled' },
      { new: true }
    );
    return { success: !!appt, appointment: appt };
  }

  if (action.action === 'reschedule') {
    const appt = await Appointment.findOneAndUpdate(
      { customerPhone: action.phone || callerPhone, date: action.old_date, time: action.old_time },
      { date: action.new_date, time: action.new_time, status: 'confirmed' },
      { new: true }
    );
    return { success: !!appt, appointment: appt };
  }

  return { success: false };
}

// ── Main chat function ────────────────────────────────────────
async function chat(messages, callerPhone = '') {
  const systemPrompt = await buildSystemPrompt();

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const reply = data.choices[0].message.content;
  const action = extractAction(reply);

  let actionResult = null;
  if (action) {
    actionResult = await executeAction(action, callerPhone);
  }

  // Clean reply — remove JSON from spoken response
  const cleanReply = reply.replace(/\{[\s\S]*?"action"[\s\S]*?\}/, '').trim();

  return { reply: cleanReply || reply, action, actionResult };
}

module.exports = { chat, buildSystemPrompt };
