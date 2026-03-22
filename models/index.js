const mongoose = require('mongoose');

// ── Customer Model ────────────────────────────────────────────
const customerSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, required: true, unique: true, trim: true },
  whatsapp:    { type: String, trim: true },
  email:       { type: String, trim: true },
  notes:       { type: String },
  totalVisits: { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
});

// ── Appointment Model ─────────────────────────────────────────
const appointmentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },
  service:   { type: String, required: true },
  date:      { type: String, required: true },  // "2025-04-10"
  time:      { type: String, required: true },  // "14:30"
  duration:  { type: Number, default: 30 },     // minutes
  status:    { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'confirmed' },
  notes:     { type: String },
  reminderSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, default: 'ai-agent' }, // 'ai-agent' or 'dashboard'
});

// ── Call Log Model ────────────────────────────────────────────
const callLogSchema = new mongoose.Schema({
  callSid:      { type: String },
  callerPhone:  { type: String },
  callerName:   { type: String },
  duration:     { type: Number, default: 0 }, // seconds
  transcript:   [{ role: String, content: String }],
  outcome:      { type: String, enum: ['appointment_booked', 'query_answered', 'transferred', 'voicemail', 'other'], default: 'other' },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  sentiment:    { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  createdAt:    { type: Date, default: Date.now },
});

// ── Business Settings Model ───────────────────────────────────
const businessSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  phone:       { type: String },
  address:     { type: String },
  timezone:    { type: String, default: 'Asia/Kolkata' },
  services: [{
    name:     { type: String },
    duration: { type: Number },  // minutes
    price:    { type: Number },
  }],
  workingHours: {
    monday:    { open: String, close: String, closed: Boolean },
    tuesday:   { open: String, close: String, closed: Boolean },
    wednesday: { open: String, close: String, closed: Boolean },
    thursday:  { open: String, close: String, closed: Boolean },
    friday:    { open: String, close: String, closed: Boolean },
    saturday:  { open: String, close: String, closed: Boolean },
    sunday:    { open: String, close: String, closed: Boolean },
  },
  agentPersonality: { type: String, default: 'friendly' },
  agentName:        { type: String, default: 'ARIA' },
  greeting:         { type: String, default: 'Hello! Thank you for calling. How can I help you today?' },
  adminPassword:    { type: String, default: 'admin123' },
});

module.exports = {
  Customer:    mongoose.model('Customer', customerSchema),
  Appointment: mongoose.model('Appointment', appointmentSchema),
  CallLog:     mongoose.model('CallLog', callLogSchema),
  Business:    mongoose.model('Business', businessSchema),
};
