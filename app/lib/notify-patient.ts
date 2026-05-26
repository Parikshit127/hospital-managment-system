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
import { sendSMS } from '@/app/lib/sms';
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
    hospitalName: string = 'Avani Hospital',
    organizationId?: string
): Promise<void> {
    const promises: Promise<void>[] = [];

    // --- Email channel ---
    if (contact.email) {
        promises.push(
            sendEmailForEvent(contact.email, event, hospitalName, organizationId).catch(err =>
                console.error(`[Notify] Email failed for ${event.type}:`, err)
            )
        );
    }

    // --- WhatsApp channel ---
    if (contact.phone) {
        promises.push(
            sendWhatsAppForEvent(contact.phone, event, hospitalName, organizationId).catch(err =>
                console.error(`[Notify] WhatsApp failed for ${event.type}:`, err)
            )
        );
    }

    // --- SMS channel ---
    if (contact.phone) {
        promises.push(
            sendSMSForEvent(contact.phone, event, hospitalName, organizationId).catch(err =>
                console.error(`[Notify] SMS failed for ${event.type}:`, err)
            )
        );
    }

    // Fire all in parallel, non-blocking
    await Promise.allSettled(promises);
}

// ========================================
// Email Routing
// ========================================

async function sendEmailForEvent(email: string, event: NotifyEvent, hospitalName: string, organizationId?: string): Promise<void> {
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
                organizationId,
            });
            break;

        case 'prescription':
            await sendPrescriptionEmail(email, event.patientName, event.doctorName, event.summaryHtml, organizationId);
            break;

        case 'admission':
            await sendAdmissionEmail(email, event.patientName, event.bedDetails, event.doctorName, organizationId);
            break;

        case 'pill_reminder':
            await sendPillReminderEmail({
                to: email,
                patientName: event.patientName,
                medicationName: event.medicationName,
                dosage: event.dosage,
                notes: event.notes,
                organizationId,
            });
            break;

        case 'lab_report':
            await sendLabReportEmail(email, event.patientName, event.testName, hospitalName, organizationId);
            break;

        case 'discharge':
            await sendDischargeEmail(email, event.patientName, event.doctorName || 'your attending physician', hospitalName, organizationId);
            break;

        case 'invoice':
            await sendInvoiceEmail(email, event.patientName, event.invoiceNumber, event.amount, hospitalName, organizationId);
            break;
    }
}

// ========================================
// WhatsApp Routing
// ========================================

async function sendWhatsAppForEvent(phone: string, event: NotifyEvent, hospitalName: string, organizationId?: string): Promise<void> {
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
                ],
                organizationId
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
            ],
            organizationId
        }).catch(e => console.error("[WA] Generic failed:", e));
    }
}

// ========================================
// SMS Routing
// ========================================

async function sendSMSForEvent(phone: string, event: NotifyEvent, hospitalName: string, organizationId?: string): Promise<void> {
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) return;

    let messageText = '';

    switch (event.type) {
        case 'appointment':
            messageText = `Dear ${event.patientName}, your appointment at ${hospitalName} is confirmed for ${event.date} at ${event.time} under Dr. ${event.doctorName}. Thank you.`;
            break;

        case 'pill_reminder':
            messageText = `Dear ${event.patientName}, this is a reminder from ${hospitalName} to take your medication: ${event.medicationName} (${event.dosage}).${event.notes ? ` Note: ${event.notes}` : ''}`;
            break;

        case 'lab_report':
            messageText = `Dear ${event.patientName}, your lab report for ${event.testName} from ${hospitalName} is now ready for collection or viewing in the patient portal.`;
            break;

        case 'discharge':
            messageText = `Dear ${event.patientName}, you have been successfully discharged from ${hospitalName}. Please follow the follow-up and prescription guidelines.`;
            break;

        case 'invoice':
            messageText = `Dear ${event.patientName}, an invoice #${event.invoiceNumber} for ₹${event.amount} has been generated at ${hospitalName} for your recent services.`;
            break;

        case 'prescription':
            messageText = `Dear ${event.patientName}, your prescription summary by Dr. ${event.doctorName} has been added to your record at ${hospitalName}. Details: ${event.summaryText}`;
            break;

        case 'admission':
            messageText = `Dear ${event.patientName}, your admission process at ${hospitalName} is complete under Dr. ${event.doctorName}. Bed/Ward: ${event.bedDetails}.`;
            break;
    }

    if (messageText) {
        await sendSMS({
            to: formattedPhone,
            message: messageText,
            organizationId,
        });
    }
}
