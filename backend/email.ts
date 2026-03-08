import nodemailer from 'nodemailer';

function getAppBaseUrl() {
    return process.env.APP_BASE_URL || 'http://localhost:3000';
}

// Create a singleton transporter instance
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Generic email sending utility
 */
export async function sendEmail({
    to,
    subject,
    html
}: {
    to: string;
    subject: string;
    html: string;
}) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.warn('⚠️ SMTP credentials are not fully configured in .env. Email skipped:', subject);
        return { success: false, error: 'SMTP not configured' };
    }

    try {
        const info = await transporter.sendMail({
            from: `"Avani Hospital OS" <${process.env.SMTP_USER}>`,
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
export async function sendWelcomeEmail(to: string, patientName: string, patientId: string, setupLink: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Welcome to Avani Hospital, ${patientName}!</h2>
            <p>Your registration is complete. You can now access all your health records, prescriptions, and lab results in your personal Patient Portal.</p>
            
            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">Your Login Credentials:</p>
                <p style="margin: 5px 0 0 0;"><strong>Patient ID:</strong> ${patientId}</p>
                <p style="margin: 8px 0 0 0;">Set your password securely using the link below:</p>
                <p style="margin: 12px 0 0 0;">
                    <a href="${setupLink}" style="display:inline-block;background:#10b981;color:#ffffff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Set Portal Password</a>
                </p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">This setup link is valid for 24 hours.</p>
            </div>
            
            <p>Please log in at <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Avani Patient Portal</a> after setting your password.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">For security reasons, please do not share these credentials.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Your Patient Portal Credentials', html });
}

/**
 * Template: AI Prescription & Clinical Summary
 */
export async function sendPrescriptionEmail(to: string, patientName: string, doctorName: string, summaryHtml: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">New Clinical Summary Added</h2>
            <p>Dear ${patientName},</p>
            <p>Dr. ${doctorName} has added a new clinical summary and prescription to your record.</p>
            
            <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
                ${summaryHtml}
            </div>
            
            <p>You can view extreme details and lab attachments in your <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a>.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Your Latest Prescription & Consult Summary', html });
}

/**
 * Template: Admission Notice
 */
export async function sendAdmissionEmail(to: string, patientName: string, bedDetails: string, doctorName: string) {
    const appBaseUrl = getAppBaseUrl();
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #1aab74;">Admission Confirmation</h2>
            <p>Dear ${patientName},</p>
            <p>This email confirms your admission at Avani Hospital under the care of Dr. ${doctorName}.</p>
            
            <div style="background: #f0faf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #0f8f5e;">Your bed assignment is confirmed as:</p>
                <p style="margin: 5px 0 0 0; font-size: 18px;">🛏️ <strong>${bedDetails}</strong></p>
            </div>
            
            <p>Please log in to the <a href="${appBaseUrl}/patient/login" style="color: #1aab74;">Patient Portal</a> to track your vital signs, nursing notes, and live billing status.</p>
        </div>
    `;

    return sendEmail({ to, subject: 'Hospital Admission Confirmation', html });
}
