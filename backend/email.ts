import nodemailer from 'nodemailer';
import { getOrganizationIntegrationConfig } from '@/app/lib/secure-config';

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeBaseUrl(raw: string): string {
    let url = raw.trim();
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url.replace(/^\/*(https?:?\/*)?/i, '');
    }
    return url;
}

function getAppBaseUrl() {
    const raw = process.env.APP_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
        || process.env.NEXT_PUBLIC_APP_URL
        || 'http://localhost:3000';
    return normalizeBaseUrl(raw);
}

// Create a singleton transporter instance
let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Get a transporter — uses org-level SMTP if provided, else falls back to global .env
 */
function getTransporter(orgConfig?: { smtp_host?: string | null; smtp_user?: string | null; smtp_pass?: string | null }) {
    const host = orgConfig?.smtp_host || process.env.SMTP_HOST;
    const user = orgConfig?.smtp_user || process.env.SMTP_USER;
    const pass = orgConfig?.smtp_pass || process.env.SMTP_PASS;

    if (!host || !user) return null;

    return nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
    });
}

export async function sendEmail({
    to,
    subject,
    html,
    organizationId
}: {
    to: string;
    subject: string;
    html: string;
    organizationId?: string;
}) {
    let orgConfig = null;
    if (organizationId) {
        try {
            orgConfig = await getOrganizationIntegrationConfig(organizationId);
        } catch (e) {
            console.error('Failed to load dynamic organization config for email:', e);
        }
    }

    const t = getTransporter(orgConfig ? {
        smtp_host: orgConfig.smtp_host as string | null,
        smtp_user: orgConfig.smtp_user as string | null,
        smtp_pass: orgConfig.smtp_pass as string | null,
    } : undefined);
    if (!t) {
        console.warn('⚠️ SMTP credentials are not fully configured. Email skipped:', subject);
        return { success: false, error: 'SMTP not configured' };
    }

    try {
        const fromUser = orgConfig?.smtp_user || process.env.SMTP_USER;
        const info = await t.sendMail({
            from: `"Axten Hospitals" <${fromUser}>`,
            to,
            subject,
            html,
        });

        console.log(`✉️ Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        return { success: false, error };
    }
}

/**
 * Template: Patient Portal Welcome (with credentials)
 */
export async function sendWelcomeEmail(to: string, patientName: string, patientId: string, setupLink: string, organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1e3a6e;">Welcome to Axten Hospitals, ${escapeHtml(patientName)}!</h2>
            <p>Your registration is complete. You can now access all your health records, prescriptions, and lab results in your personal Patient Portal.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">Your Login Credentials:</p>
                <p style="margin: 5px 0 0 0;"><strong>Patient ID:</strong> ${escapeHtml(patientId)}</p>
                <p style="margin: 8px 0 0 0;">Set your password securely using the link below:</p>
                <p style="margin: 12px 0 0 0;">
                    <a href="${setupLink}" style="display:inline-block;background:#10b981;color:#ffffff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Set Portal Password</a>
                </p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">This setup link is valid for 24 hours.</p>
            </div>
            
            <p>Please log in at <a href="${appBaseUrl}/patient/login" style="color: #1e3a6e;">Axten Patient Portal</a> after setting your password.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">For security reasons, please do not share these credentials.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Your Patient Portal Credentials', html, organizationId });
}

/**
 * Template: AI Prescription & Clinical Summary
 */
export async function sendPrescriptionEmail(to: string, patientName: string, doctorName: string, summaryHtml: string, organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">New Clinical Summary Added</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>Dr. ${escapeHtml(doctorName)} has added a new clinical summary and prescription to your record.</p>

            <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
                ${summaryHtml}
            </div>
            
            <p>You can view extreme details and lab attachments in your <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Your Latest Prescription & Consult Summary', html, organizationId });
}

/**
 * Template: Admission Notice
 */
export async function sendAdmissionEmail(to: string, patientName: string, bedDetails: string, doctorName: string, organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Admission Confirmation</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>This email confirms your admission at Axten Hospitals under the care of Dr. ${escapeHtml(doctorName)}.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">Your bed assignment is confirmed as:</p>
                <p style="margin: 5px 0 0 0; font-size: 18px;">🛏️ <strong>${escapeHtml(bedDetails)}</strong></p>
            </div>
            
            <p>Please log in to the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a> to track your vital signs, nursing notes, and live billing status.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Hospital Admission Confirmation', html, organizationId });
}

/**
 * Template: Appointment Confirmation
 */
export async function sendAppointmentConfirmationEmail({
    to,
    patientName,
    doctorName,
    department,
    date,
    time,
    hospitalName,
    organizationId,
}: {
    to: string;
    patientName: string;
    doctorName: string;
    department: string;
    date: string;
    time: string;
    hospitalName: string;
    organizationId?: string;
}) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Appointment Confirmed</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>Your appointment at <strong>${escapeHtml(hospitalName)}</strong> has been successfully booked. Here are the details:</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Doctor:</strong> Dr. ${escapeHtml(doctorName)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Department:</strong> ${escapeHtml(department)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Date:</strong> ${escapeHtml(date)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Time:</strong> ${escapeHtml(time)}</p>
            </div>

            <p>Please arrive 15 minutes before your scheduled time. You can view or manage your appointments in the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">If you need to cancel or reschedule, please do so at least 24 hours in advance.</p>
        </div>
    `;

    return sendEmail({ to, subject: `Appointment Confirmation - ${escapeHtml(hospitalName)}`, html, organizationId });
}

/**
 * Template: Pill Reminder
 */
export async function sendPillReminderEmail({
    to,
    patientName,
    medicationName,
    dosage,
    notes,
    organizationId,
}: {
    to: string;
    patientName: string;
    medicationName: string;
    dosage: string;
    notes?: string | null;
    organizationId?: string;
}) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <span style="font-size: 40px;">💊</span>
            </div>
            <h2 style="color: #1aab74; text-align: center;">Medication Reminder</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>It's time for your medication as prescribed by your doctor.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #d1fae5;">
                <p style="margin: 0;"><strong>Medication:</strong> ${escapeHtml(medicationName)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Dosage:</strong> ${escapeHtml(dosage)}</p>
                ${notes ? `<p style="margin: 8px 0 0 0; font-style: italic; color: #666;">Note: ${escapeHtml(notes)}</p>` : ''}
            </div>

            <p>Please ensure you take your medication on time. You can track your full prescription history in the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>.</p>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #999; font-size: 12px; text-align: center;">This is an automated reminder from Axten Hospitals. Please do not reply to this email.</p>
        </div>
    `;

    return sendEmail({ to, subject: `Medication Reminder: ${escapeHtml(medicationName)}`, html, organizationId });
}

/**
 * Template: Lab Report Ready
 */
export async function sendLabReportEmail(to: string, patientName: string, testName: string, hospitalName: string = 'Axten Hospitals', organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Lab Report Ready</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>Your <strong>${escapeHtml(testName)}</strong> report from ${escapeHtml(hospitalName)} is ready.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">You can view and download your lab report from the Patient Portal.</p>
            </div>

            <p>Log in at <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a> to access your report, or collect a printed copy from the Lab.</p>
        </div>
    `;

    return sendEmail({ to, subject: `Lab Report Ready: ${escapeHtml(testName)} — ${escapeHtml(hospitalName)}`, html, organizationId });
}

/**
 * Template: Discharge Summary
 */
export async function sendDischargeEmail(to: string, patientName: string, doctorName: string, hospitalName: string = 'Axten Hospitals', organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Discharge Summary Ready</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>Your discharge summary has been prepared by Dr. ${escapeHtml(doctorName)} at ${escapeHtml(hospitalName)}.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">Your discharge summary and follow-up instructions are available online.</p>
            </div>

            <p>View your complete discharge report in the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>, or collect from reception.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">Wishing you a speedy recovery! For any questions, contact reception.</p>
        </div>
    `;

    return sendEmail({ to, subject: `Discharge Summary — ${escapeHtml(hospitalName)}`, html, organizationId });
}

/**
 * Template: Invoice / Billing Notification
 */
export async function sendInvoiceEmail(to: string, patientName: string, invoiceNumber: string, amount: string, hospitalName: string = 'Axten Hospitals', organizationId?: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Invoice Generated</h2>
            <p>Dear ${escapeHtml(patientName)},</p>
            <p>An invoice has been generated at ${escapeHtml(hospitalName)}.</p>

            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Invoice No:</strong> #${escapeHtml(invoiceNumber)}</p>
                <p style="margin: 8px 0 0 0; font-size: 22px; font-weight: bold; color: #0f8f5e;">&#8377;${escapeHtml(amount)}</p>
            </div>

            <p>You can view the detailed breakdown and pay online via the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">For billing queries, contact our finance desk.</p>
        </div>
    `;

    return sendEmail({ to, subject: `Invoice #${escapeHtml(invoiceNumber)} — ${escapeHtml(hospitalName)}`, html, organizationId });
}

/**
 * Template: Expense Approved
 */
export async function sendExpenseApprovedEmail({
    to,
    approverName,
    expenseNumber,
    description,
    amount,
    approvedBy,
}: {
    to: string;
    approverName: string;
    expenseNumber: string;
    description: string;
    amount: string;
    approvedBy: string;
}) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #059669;">✅ Expense Approved</h2>
            <p>Dear ${escapeHtml(approverName)},</p>
            <p>The following expense has been <strong>approved</strong>.</p>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
                <p style="margin: 0;"><strong>Expense No:</strong> ${escapeHtml(expenseNumber)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Description:</strong> ${escapeHtml(description)}</p>
                <p style="margin: 8px 0 0 0; font-size: 20px; font-weight: bold; color: #059669;">&#8377;${escapeHtml(amount)}</p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">Approved by: ${escapeHtml(approvedBy)}</p>
            </div>
            <p>You can view the full expense record in the <a href="${appBaseUrl}/finance/expenses" style="color: #059669;">Finance Portal</a>.</p>
        </div>
    `;
    return sendEmail({ to, subject: `Expense Approved: ${escapeHtml(expenseNumber)}`, html });
}

/**
 * Template: Expense Rejected
 */
export async function sendExpenseRejectedEmail({
    to,
    recipientName,
    expenseNumber,
    description,
    amount,
    rejectedBy,
    reason,
}: {
    to: string;
    recipientName: string;
    expenseNumber: string;
    description: string;
    amount: string;
    rejectedBy: string;
    reason: string;
}) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #dc2626;">❌ Expense Rejected</h2>
            <p>Dear ${escapeHtml(recipientName)},</p>
            <p>The following expense has been <strong>rejected</strong>.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fecaca;">
                <p style="margin: 0;"><strong>Expense No:</strong> ${escapeHtml(expenseNumber)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Description:</strong> ${escapeHtml(description)}</p>
                <p style="margin: 8px 0 0 0; font-size: 20px; font-weight: bold; color: #dc2626;">&#8377;${escapeHtml(amount)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Rejected by:</strong> ${escapeHtml(rejectedBy)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
            </div>
            <p>Please review and resubmit if needed via the <a href="${appBaseUrl}/finance/expenses" style="color: #dc2626;">Finance Portal</a>.</p>
        </div>
    `;
    return sendEmail({ to, subject: `Expense Rejected: ${escapeHtml(expenseNumber)}`, html });
}

/**
 * Template: Expense Paid / Payment Processed
 */
export async function sendExpensePaidEmail({
    to,
    recipientName,
    expenseNumber,
    description,
    amount,
    paymentMethod,
    referenceNo,
}: {
    to: string;
    recipientName: string;
    expenseNumber: string;
    description: string;
    amount: string;
    paymentMethod: string;
    referenceNo?: string;
}) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #0284c7;">💳 Expense Payment Processed</h2>
            <p>Dear ${escapeHtml(recipientName)},</p>
            <p>Payment has been processed for the following expense.</p>
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #bae6fd;">
                <p style="margin: 0;"><strong>Expense No:</strong> ${escapeHtml(expenseNumber)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Description:</strong> ${escapeHtml(description)}</p>
                <p style="margin: 8px 0 0 0; font-size: 20px; font-weight: bold; color: #0284c7;">&#8377;${escapeHtml(amount)}</p>
                <p style="margin: 8px 0 0 0;"><strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}</p>
                ${referenceNo ? `<p style="margin: 8px 0 0 0;"><strong>Reference No:</strong> ${escapeHtml(referenceNo)}</p>` : ''}
            </div>
            <p>View payment details in the <a href="${appBaseUrl}/finance/expenses" style="color: #0284c7;">Finance Portal</a>.</p>
        </div>
    `;
    return sendEmail({ to, subject: `Payment Processed: ${escapeHtml(expenseNumber)}`, html });
}
