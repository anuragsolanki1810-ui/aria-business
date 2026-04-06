// ============================================================
//  ARIA Platform — AI Service (Multi-tenant)
// ============================================================

const { Appointment, Customer, Business } = require('../models');
const { format, addDays } = require('date-fns');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Build system prompt for specific business ─────────────────
async function buildSystemPrompt(businessId) {
  const business = await Business.findById(businessId);
  if (!business) throw new Error('Business not found');

  const agentName = business.agentName || 'ARIA';
  const bizName   = business.name;
  const services  = business.services?.map(s => `${s.name} (${s.duration} mins, ₹${s.price})`).join(', ') || 'our services';
  const today     = format(new Date(), 'EEEE, MMMM d yyyy');
  const tomorrow  = format(addDays(new Date(), 1), 'EEEE, MMMM d yyyy');

  const personalities = {
    friendly:     'warm, friendly and helpful',
    professional: 'professional, formal and efficient',
    funny:        'witty, humorous but still helpful',
    caring:       'caring, empathetic and patient',
  };

  const personality = personalities[business.agentPersonality] || 'warm, friendly and helpful';

  return `You are ${agentName}, the AI receptionist for ${bizName}.
Today is ${today}. Tomorrow is ${tomorrow}.
Your personality: ${personality}.

Your job:
1. Greet customers warmly
2. Book, reschedule or cancel appointments
3. Answer questions about services, hours and pricing
4. Take messages when needed

Available services: ${services}

When booking appointments collect:
- Customer name
- Preferred date (today/tomorrow/specific date)
- Preferred time
- Service needed
- Phone number

IMPORTANT RULES:
- Keep responses SHORT — under 3 sentences. You are speaking on the phone.
- Be warm and efficient.
- When you have enough info to book reply with JSON:
  {"action":"book","name":"John","phone":"+91XXXXXXXXXX","service":"Haircut","date":"2025-04-10","time":"14:00","notes":""}
- For cancellation:
  {"action":"cancel","phone":"+91XXXXXXXXXX","date":"2025-04-10","time":"14:00"}
- For reschedule:
  {"action":"reschedule","phone":"+91XXXXXXXXXX","old_date":"2025-04-10","old_time":"14:00","new_date":"2025-04-11","new_time":"15:00"}
- Only include JSON when you have ALL required info.
- Speak in customer's language if they use Hindi or another language.
- Never say you are an AI unless directly asked.`;
}

// ── Extract action from AI response ──────────────────────────
function extractAction(text) {
  const match = text.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); }
  catch { return null; }
}

// ── Execute booking action ────────────────────────────────────
async function executeAction(action, callerPhone, businessId) {
  if (action.action === 'book') {
    const phone = action.phone || callerPhone;

    let customer = await Customer.findOne({ businessId, phone });
    if (!customer) {
      customer = await Customer.create({ businessId, name: action.name || 'Unknown', phone, whatsapp: phone });
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

    return { success: true, appointment, customer };
  }

  if (action.action === 'cancel') {
    const appt = await Appointment.findOneAndUpdate(
      { businessId, customerPhone: action.phone || callerPhone, date: action.date, time: action.time },
      { status: 'cancelled' },
      { new: true }
    );
    return { success: !!appt, appointment: appt };
  }

  if (action.action === 'reschedule') {
    const appt = await Appointment.findOneAndUpdate(
      { businessId, customerPhone: action.phone || callerPhone, date: action.old_date, time: action.old_time },
      { date: action.new_date, time: action.new_time, status: 'confirmed' },
      { new: true }
    );
    return { success: !!appt, appointment: appt };
  }

  return { success: false };
}

// ── Main chat function ────────────────────────────────────────
async function chat(messages, callerPhone, businessId) {
  const systemPrompt = await buildSystemPrompt(businessId);

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
    actionResult = await executeAction(action, callerPhone, businessId);
  }

  const cleanReply = reply.replace(/\{[\s\S]*?"action"[\s\S]*?\}/, '').trim();
  return { reply: cleanReply || reply, action, actionResult };
}

module.exports = { chat, buildSystemPrompt };
