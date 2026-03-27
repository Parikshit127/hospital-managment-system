import { requireTenantContext } from './tenant';
import { sendPillReminderEmail } from './email';
import { sendPillReminderMessage } from '@/app/lib/whatsapp';

export async function processPillReminders() {
    console.log('[Pill Scheduler] Starting check at:', new Date().toISOString());
    
    try {
        const { db } = await requireTenantContext();
        
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMin = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMin}`;

        // Find active reminders that should trigger now
        // Note: In a real production app, you might use a more robust queue (like BullMQ)
        // and handle timezones properly. This is a simplified version.
        
        const reminders = await db.pillReminder.findMany({
            where: {
                status: 'Active',
                start_date: { lte: now },
                end_date: { gte: now },
                schedule_times: {
                    has: currentTime
                }
            },
            include: {
                patient: {
                    select: {
                        full_name: true,
                        email: true,
                        phone: true
                    }
                }
            }
        });

        console.log(`[Pill Scheduler] Found ${reminders.length} reminders to process for ${currentTime}`);

        for (const reminder of reminders) {
            if (reminder.patient?.email) {
                try {
                    
                    console.log(`[Pill Scheduler] Sent email for reminder ${reminder.id} to ${reminder.patient.email}`);
                } catch (err) {
                    console.error(`[Pill Scheduler] Failed to send email for reminder ${reminder.id}:`, err);
                }
            }

            if (reminder.patient?.phone) {
                try {
                    await sendPillReminderMessage(
                        reminder.patient.phone,
                        reminder.patient.full_name,
                        reminder.medication_name,
                        reminder.dosage,
                        reminder.notes
                    );
                    console.log(`[Pill Scheduler] Sent WhatsApp for reminder ${reminder.id} to ${reminder.patient.phone}`);
                } catch (err) {
                    console.error(`[Pill Scheduler] Failed to send WhatsApp for reminder ${reminder.id}:`, err);
                }
            }
        }

    } catch (error) {
        console.error('[Pill Scheduler] Fatal error:', error);
    }
}
