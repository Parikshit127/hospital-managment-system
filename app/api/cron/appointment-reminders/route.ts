import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/app/lib/whatsapp';

// Called daily (e.g. 18:00) to send 24h reminders for tomorrow's appointments.
// Secure with CRON_SECRET env var in production.
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const start = new Date(tomorrow);
        start.setHours(0, 0, 0, 0);
        const end = new Date(tomorrow);
        end.setHours(23, 59, 59, 999);

        const appointments = await prisma.appointments.findMany({
            where: {
                appointment_date: { gte: start, lte: end },
                status: { in: ['Pending', 'Confirmed'] },
                reminder24Sent: false,
            },
            include: {
                patient: { select: { full_name: true, phone: true } },
                organization: { select: { name: true } },
            },
        });

        let sent = 0;
        let failed = 0;

        for (const appt of appointments) {
            if (!appt.patient?.phone) { failed++; continue; }

            const apptTime = new Date(appt.appointment_date).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit',
            });

            try {
                await sendWhatsAppMessage({
                    to: formatPhoneNumber(appt.patient.phone),
                    message: `*${appt.organization?.name || 'Hospital'} — Appointment Reminder*\n\nDear ${appt.patient.full_name},\n\nThis is a reminder for your appointment *tomorrow* at *${apptTime}*.\nDoctor: *Dr. ${appt.doctor_name || 'your doctor'}*\nDepartment: ${appt.department || 'OPD'}\n\nPlease arrive 10 minutes early for check-in.\n\nReply CANCEL to cancel your appointment.`,
                });

                await prisma.appointments.update({
                    where: { appointment_id: appt.appointment_id },
                    data: { reminder24Sent: true },
                });

                sent++;
            } catch {
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            processed: appointments.length,
            sent,
            failed,
        });
    } catch (error) {
        console.error('Appointment reminder cron failed:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
