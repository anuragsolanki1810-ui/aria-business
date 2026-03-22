// ============================================================
//  ARIA Business OS — Reminder Scheduler
//  Runs daily to send appointment reminders via WhatsApp
// ============================================================

const cron = require('node-cron');
const { format, addDays } = require('date-fns');
const { Appointment } = require('../models');
const { sendReminder } = require('./notificationService');

function startReminderScheduler() {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running appointment reminder job...');

    try {
      // Get tomorrow's appointments that haven't been reminded yet
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

      const appointments = await Appointment.find({
        date:          tomorrow,
        status:        'confirmed',
        reminderSent:  false,
      });

      console.log(`Sending reminders for ${appointments.length} appointments`);

      for (const appt of appointments) {
        try {
          await sendReminder(appt);
          appt.reminderSent = true;
          await appt.save();
          console.log(`Reminder sent to ${appt.customerPhone}`);
        } catch (err) {
          console.error(`Failed to send reminder to ${appt.customerPhone}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Reminder job error:', err.message);
    }
  }, {
    timezone: process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata',
  });

  console.log('Reminder scheduler started — runs daily at 9 AM');
}

module.exports = { startReminderScheduler };
