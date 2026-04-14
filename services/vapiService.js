// ============================================================
//  ARIA Business Platform — Vapi Service
//  Creates AI voice assistants for each business using Vapi.ai
//  with ElevenLabs Meera voice for natural Hindi/English speech
// ============================================================

const VAPI_API_KEY       = process.env.VAPI_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'; // Meera default
const GROQ_API_KEY       = process.env.GROQ_API_KEY;
const BACKEND_URL        = process.env.BACKEND_URL || 'https://aria-business-platform.up.railway.app';

// ── Build system prompt for a business ───────────────────────
function buildSystemPrompt(business) {
  const services = business.services?.map(s =>
    `${s.name} (${s.duration} minutes, ₹${s.price})`
  ).join(', ') || 'our services';

  const personalities = {
    friendly:     'warm, friendly and helpful like a good friend',
    professional: 'professional, formal and efficient',
    funny:        'witty and humorous but always helpful',
    caring:       'caring, empathetic and very patient',
  };

  const personality = personalities[business.agentPersonality] || 'warm and friendly';

  return `You are ${business.agentName || 'ARIA'}, the AI receptionist for ${business.name}.
Your personality: ${personality}.

Your jobs:
1. Greet customers warmly when they call
2. Book, reschedule or cancel appointments
3. Answer questions about services, prices and hours
4. Take messages when needed

Services available: ${services}

When booking an appointment, collect:
- Customer full name
- Preferred date (say today, tomorrow, or specific date)
- Preferred time
- Which service they want
- Their phone number

VERY IMPORTANT RULES:
- Keep ALL responses under 2-3 sentences — you are on a phone call
- Speak naturally like a real human receptionist
- When you have all info to book, include this JSON at the end of your response:
  {"action":"book","name":"John","phone":"+91XXXXXXXXXX","service":"Haircut","date":"2025-04-10","time":"14:00"}
- For cancellation include:
  {"action":"cancel","phone":"+91XXXXXXXXXX","date":"2025-04-10","time":"14:00"}
- For reschedule include:
  {"action":"reschedule","phone":"+91XXXXXXXXXX","old_date":"2025-04-10","old_time":"14:00","new_date":"2025-04-11","new_time":"15:00"}
- Never mention you are an AI unless directly asked
- If customer speaks Hindi, respond in Hindi
- If customer speaks English, respond in English
- Be warm, helpful and efficient`;
}

// ── Create Vapi assistant for a business ─────────────────────
async function createVapiAssistant(business) {
  if (!VAPI_API_KEY) throw new Error('VAPI_API_KEY not configured');

  const assistantConfig = {
    name: `${business.name} - ARIA`,
    model: {
      provider: 'groq',
      model:    'llama-3.3-70b-versatile',
      messages: [
        {
          role:    'system',
          content: buildSystemPrompt(business),
        }
      ],
      maxTokens:   300,
      temperature: 0.7,
    },
    voice: {
      provider: 'elevenlabs',
      voiceId:  ELEVENLABS_VOICE_ID,
      stability:        0.5,
      similarityBoost:  0.75,
      style:            0.5,
      useSpeakerBoost:  true,
    },
    transcriber: {
      provider: 'deepgram',
      model:    'nova-2',
      language: 'en-IN',
      smartFormat: true,
    },
    firstMessage: business.greeting ||
      `Namaste! Thank you for calling ${business.name}. I am ${business.agentName || 'ARIA'}, your AI assistant. How can I help you today?`,
    endCallMessage: 'Thank you for calling. Have a great day! Goodbye.',
    serverUrl: `${BACKEND_URL}/vapi/webhook`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || 'aria-webhook-secret',
    endCallPhrases: ['goodbye', 'bye', 'thank you bye', 'ok bye', 'alvida'],
    backgroundSound: 'office',
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    maxDurationSeconds: 600, // 10 minute max call
  };

  const response = await fetch('https://api.vapi.ai/assistant', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${VAPI_API_KEY}`,
    },
    body: JSON.stringify(assistantConfig),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to create Vapi assistant');

  return data;
}

// ── Update existing Vapi assistant ───────────────────────────
async function updateVapiAssistant(assistantId, business) {
  if (!VAPI_API_KEY || !assistantId) return null;

  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method:  'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${VAPI_API_KEY}`,
    },
    body: JSON.stringify({
      name: `${business.name} - ARIA`,
      model: {
        provider: 'groq',
        model:    'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: buildSystemPrompt(business) }],
        maxTokens: 300,
      },
      voice: {
        provider: 'elevenlabs',
        voiceId:  ELEVENLABS_VOICE_ID,
        stability:       0.5,
        similarityBoost: 0.75,
      },
      firstMessage: business.greeting ||
        `Namaste! Thank you for calling ${business.name}. I am ${business.agentName || 'ARIA'}.  How can I help you today?`,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to update assistant');
  return data;
}

// ── Delete Vapi assistant ─────────────────────────────────────
async function deleteVapiAssistant(assistantId) {
  if (!VAPI_API_KEY || !assistantId) return;
  await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
  });
}

// ── Get call logs from Vapi ───────────────────────────────────
async function getVapiCalls(assistantId, limit = 20) {
  if (!VAPI_API_KEY) return [];
  try {
    const response = await fetch(
      `https://api.vapi.ai/call?assistantId=${assistantId}&limit=${limit}`,
      { headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` } }
    );
    const data = await response.json();
    return data || [];
  } catch {
    return [];
  }
}

module.exports = {
  createVapiAssistant,
  updateVapiAssistant,
  deleteVapiAssistant,
  getVapiCalls,
  buildSystemPrompt,
};
