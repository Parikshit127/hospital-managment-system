/**
 * Unified Patient Notification Dispatcher
 *
 * Sends notifications via BOTH email AND WhatsApp for every event.
 * Non-blocking — errors are logged but never thrown.
 */

import {
    sendAppointmentConfirmationEmail,
    sendPrescriptionEmail,
    sendAdmissionEmail,
    sendPillReminderEmail,
    sendLabReportEmail,
    sendDischargeEmail,
    sendInvoiceEmail,
} from '@/backend/email';

import {
    sendAppointmentReminder,
    sendPrescriptionWhatsApp,
    sendAdmissionWhatsApp,
    sendPillReminderWhatsApp,
    sendLabReportReady,
    sendDischargeSummary,
    sendInvoiceWhatsApp,
} from '@/app/lib/whatsapp';

// ========================================
// Event Types
// ========================================

type AppointmentEvent = {
    type: 'appointment';
    patientName: string;
    doctorName: string;
    department: string;
    date: string;
    time: string;
    hospitalName: string;
};

type PrescriptionEvent = {
    type: 'prescription';
    patientName: string;
    doctorName: string;
    summaryHtml: string;
    summaryText: string;
};

type AdmissionEvent = {
    type: 'admission';
    patientName: string;
    doctorName: string;
    bedDetails: string;
};

type PillReminderEvent = {
    type: 'pill_reminder';
    patientName: string;
    medicationName: string;
    dosage: string;
    notes?: string | null;
};

type LabReportEvent = {
    type: 'lab_report';
    patientName: string;
    testName: string;
};

type DischargeEvent = {
    type: 'discharge';
    patientName: string;
    doctorName?: string;
};

type InvoiceEvent = {
    type: 'invoice';
    patientName: string;
    invoiceNumber: string;
    amount: string;
};

export type NotifyEvent =
    | AppointmentEvent
    | PrescriptionEvent
    | AdmissionEvent
    | PillReminderEvent
    | LabReportEvent
    | DischargeEvent
    | InvoiceEvent;

interface PatientContact {
    email?: string | null;
    phone?: string | null;
}

// ========================================
// Main Dispatcher
// ========================================

export async function notifyPatient(
    contact: PatientContact,
    event: NotifyEvent,
    hospitalName: string = 'Avani Hospital'
): Promise<void> {
    const promises: Promise<void>[] = [];

    // --- Email channel ---
    if (contact.email) {
        promises.push(
            sendEmailForEvent(contact.email, event, hospitalName).catch(err =>
                console.error(`[Notify] Email failed for ${event.type}:`, err)
            )
        );
    }

    // --- WhatsApp channel ---
    if (contact.phone) {
        promises.push(
            sendWhatsAppForEvent(contact.phone, event, hospitalName).catch(err =>
                console.error(`[Notify] WhatsApp failed for ${event.type}:`, err)
            )
        );
    }

    // Fire all in parallel, non-blocking
    await Promise.allSettled(promises);
}

// ========================================
// Email Routing
// ========================================

async function sendEmailForEvent(email: string, event: NotifyEvent, hospitalName: string): Promise<void> {
    switch (event.type) {
        case 'appointment':
            await sendAppointmentConfirmationEmail({
                to: email,
                patientName: event.patientName,
                doctorName: event.doctorName,
                department: event.department,
                date: event.date,
                time: event.time,
                hospitalName,
            });
            break;

        case 'prescription':
            await sendPrescriptionEmail(email, event.patientName, event.doctorName, event.summaryHtml);
            break;

        case 'admission':
            await sendAdmissionEmail(email, event.patientName, event.bedDetails, event.doctorName);
            break;

        case 'pill_reminder':
            await sendPillReminderEmail({
                to: email,
                patientName: event.patientName,
                medicationName: event.medicationName,
                dosage: event.dosage,
                notes: event.notes,
            });
            break;

        case 'lab_report':
            await sendLabReportEmail(email, event.patientName, event.testName, hospitalName);
            break;

        case 'discharge':
            await sendDischargeEmail(email, event.patientName, event.doctorName || 'your attending physician', hospitalName);
            break;

        case 'invoice':
            await sendInvoiceEmail(email, event.patientName, event.invoiceNumber, event.amount, hospitalName);
            break;
    }
}

// ========================================
// WhatsApp Routing
// ========================================

async function sendWhatsAppForEvent(phone: string, event: NotifyEvent, hospitalName: string): Promise<void> {
    switch (event.type) {
        case 'appointment':
            await sendAppointmentReminder(phone, event.patientName, event.doctorName, `${event.date} at ${event.time}`, hospitalName);
            break;

        case 'prescription':
            await sendPrescriptionWhatsApp(phone, event.patientName, event.doctorName, event.summaryText, hospitalName);
            break;

        case 'admission':
            await sendAdmissionWhatsApp(phone, event.patientName, event.doctorName, event.bedDetails, hospitalName);
            break;

        case 'pill_reminder':
            await sendPillReminderWhatsApp(phone, event.patientName, event.medicationName, event.dosage, hospitalName);
            break;

        case 'lab_report':
            await sendLabReportReady(phone, event.patientName, event.testName, hospitalName);
            break;

        case 'discharge':
            await sendDischargeSummary(phone, event.patientName, hospitalName);
            break;

        case 'invoice':
            await sendInvoiceWhatsApp(phone, event.patientName, event.invoiceNumber, event.amount, hospitalName);
            break;
    }
}
