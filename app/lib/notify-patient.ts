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

import { sendWhatsAppMessage, sendWhatsAppTemplate, formatPhoneNumber } from '@/app/lib/whatsapp';
import {
    appointmentReminderMsg,
    labReportReadyMsg,
    billingInvoiceMsg,
    dischargeSummaryMsg,
    pillReminderMsg,
} from '@/app/lib/whatsapp-templates';

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
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return;

    let customBody = '';

    switch (event.type) {
        case 'appointment':
            await sendWhatsAppTemplate({
                to: formattedPhone,
                templateName: 'appointment_confirmed',
                userName: event.patientName,
                params: [
                    hospitalName,
                    event.patientName,
                    event.doctorName,
                    event.department,
                    event.date,
                    event.time,
                ]
            }).catch(e => console.error("[WA] Appt failed:", e));
            return;

        case 'pill_reminder':
            customBody = `It's time to take your medication: *${event.medicationName}* (${event.dosage}).${event.notes ? `\nNote: ${event.notes}` : ''}`;
            break;

        case 'lab_report':
            customBody = `Your lab report for *${event.testName}* is now ready for collection or viewing in the portal.`;
            break;

        case 'discharge':
            customBody = `You have been successfully discharged. Please follow the instructions provided in your discharge summary.`;
            break;

        case 'invoice':
            customBody = `An invoice (#${event.invoiceNumber}) for ₹${event.amount} has been generated for your recent services.`;
            break;

        case 'prescription':
            customBody = `Your clinical summary and prescription by Dr. ${event.doctorName} are now available.\n\nDiagnosis: *${event.summaryText}*`;
            break;

        case 'admission':
            customBody = `Your admission process is complete.\nAdmitting Doctor: Dr. ${event.doctorName}\nBed/Ward: ${event.bedDetails}`;
            break;
    }

    if (customBody) {
        await sendWhatsAppTemplate({
            to: formattedPhone,
            templateName: 'generic_hospital_update',
            userName: event.patientName,
            params: [
                hospitalName,
                event.patientName,
                customBody,
                hospitalName
            ]
        }).catch(e => console.error("[WA] Generic failed:", e));
    }
}
