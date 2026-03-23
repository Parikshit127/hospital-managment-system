import { requireTenantContext } from './tenant';
import { sendPillReminderEmail } from './email';

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
                        email: true
                    }
                }
            }
        });

        console.log(`[Pill Scheduler] Found ${reminders.length} reminders to process for ${currentTime}`);

        for (const reminder of reminders) {
            if (reminder.patient?.email) {
                try {
                    await sendPillReminderEmail({
                        to: reminder.patient.email,
                        patientName: reminder.patient.full_name,
                        medicationName: reminder.medication_name,
                        dosage: reminder.dosage,
                        notes: reminder.notes
                    });
                    
                    console.log(`[Pill Scheduler] Sent email for reminder ${reminder.id} to ${reminder.patient.email}`);
                    
                    // Log the reminder event
                    await db.system_audit_logs.create({
                       data: {
                           action: 'SENT_PILL_REMINDER_EMAIL',
                           module: 'backend',
                           entity_type: 'pill_reminder',
                           entity_id: reminder.id,
                           details: JSON.stringify({ sent_to: reminder.patient.email }),
                           organizationId: reminder.organizationId
                       }
                    });
                } catch (err) {
                    console.error(`[Pill Scheduler] Failed to send email for reminder ${reminder.id}:`, err);
                }
            }
        }

    } catch (error) {
        console.error('[Pill Scheduler] Fatal error:', error);
    }
}
