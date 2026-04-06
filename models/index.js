const mongoose = require('mongoose');

// ── Business (Tenant) Model ───────────────────────────────────
const businessSchema = new mongoose.Schema({
  // Login credentials
  email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true },

  // Business info
  name:         { type: String, required: true, trim: true },
  phone:        { type: String, trim: true },
  address:      { type: String },
  timezone:     { type: String, default: 'Asia/Kolkata' },

  // Twilio number assigned to this business
  twilioNumber: { type: String },

  // Subscription
  plan:         { type: String, enum: ['trial', 'starter', 'growth', 'pro'], default: 'trial' },
  trialEndsAt:  { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  isActive:     { type: Boolean, default: true },

  // Services offered
  services: [{
    name:     String,
    duration: Number,
    price:    Number,
  }],

  // Working hours
  workingHours: {
    monday:    { open: { type: String, default: '09:00' }, close: { type: String, default: '18:00' }, closed: { type: Boolean, default: false } },
    tuesday:   { open: { type: String, default: '09:00' }, close: { type: String, default: '18:00' }, closed: { type: Boolean, default: false } },
    wednesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '18:00' }, closed: { type: Boolean, default: false } },
    thursday:  { open: { type: String, default: '09:00' }, close: { type: String, default: '18:00' }, closed: { type: Boolean, default: false } },
    friday:    { open: { type: String, default: '09:00' }, close: { type: String, default: '18:00' }, closed: { type: Boolean, default: false } },
    saturday:  { open: { type: String, default: '10:00' }, close: { type: String, default: '16:00' }, closed: { type: Boolean, default: false } },
    sunday:    { open: { type: String, default: '10:00' }, close: { type: String, default: '14:00' }, closed: { type: Boolean, default: true  } },
  },

  // AI Agent settings
  agentName:    { type: String, default: 'ARIA' },
  agentPersonality: { type: String, default: 'friendly' },
  greeting:     { type: String, default: 'Thank you for calling. How can I help you today?' },
  language:     { type: String, default: 'en-IN' },

  createdAt:    { type: Date, default: Date.now },
});

// ── Customer Model ────────────────────────────────────────────
const customerSchema = new mongoose.Schema({
  businessId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  whatsapp:    { type: String, trim: true },
  email:       { type: String, trim: true },
  notes:       { type: String },
  totalVisits: { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
});

// Unique phone per business
customerSchema.index({ businessId: 1, phone: 1 }, { unique: true });

// ── Appointment Model ─────────────────────────────────────────
const appointmentSchema = new mongoose.Schema({
  businessId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  customer:      { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },
  service:       { type: String, required: true },
  date:          { type: String, required: true },
  time:          { type: String, required: true },
  duration:      { type: Number, default: 30 },
  status:        { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'confirmed' },
  notes:         { type: String },
  reminderSent:  { type: Boolean, default: false },
  createdBy:     { type: String, default: 'ai-agent' },
  createdAt:     { type: Date, default: Date.now },
});

// ── Call Log Model ────────────────────────────────────────────
const callLogSchema = new mongoose.Schema({
  businessId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  callSid:      { type: String },
  callerPhone:  { type: String },
  duration:     { type: Number, default: 0 },
  transcript:   [{ role: String, content: String }],
  outcome:      { type: String, enum: ['appointment_booked', 'query_answered', 'transferred', 'voicemail', 'other'], default: 'other' },
  appointmentId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  sentiment:    { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  createdAt:    { type: Date, default: Date.now },
});

module.exports = {
  Business:    mongoose.model('Business', businessSchema),
  Customer:    mongoose.model('Customer', customerSchema),
  Appointment: mongoose.model('Appointment', appointmentSchema),
  CallLog:     mongoose.model('CallLog', callLogSchema),
};
