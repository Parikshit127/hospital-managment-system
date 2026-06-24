/**
 * lib/mis/delivery.ts
 * 
 * Delivery adapter for the MIS Report scheduling engine.
 */

import nodemailer from 'nodemailer';

export async function deliverReport(
    reportName: string,
    buffer: Buffer,
    format: string, // 'excel' or 'pdf'
    recipients: string[],
    channel: string // 'email' or 'whatsapp'
) {
    console.log(`\n======================================================`);
    console.log(`[DELIVERY ADAPTER] 🚀 Delivering Scheduled Report!`);
    console.log(`[DELIVERY ADAPTER] Report: ${reportName}`);
    console.log(`[DELIVERY ADAPTER] Channel: ${channel.toUpperCase()}`);
    console.log(`[DELIVERY ADAPTER] Recipients: ${recipients.join(', ')}`);
    console.log(`[DELIVERY ADAPTER] File size: ${(buffer.length / 1024).toFixed(2)} KB. Format: ${format}`);
    console.log(`======================================================\n`);

    if (channel === 'email') {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            // Format timestamp for filename
            const dateStr = new Date().toISOString().split('T')[0];
            const extension = format === 'excel' ? 'xlsx' : 'pdf';
            const filename = `${reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${dateStr}.${extension}`;
            const mimeType = format === 'excel' 
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf';

            const mailOptions = {
                from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
                to: recipients,
                subject: `Scheduled Report: ${reportName}`,
                text: `Hello,\n\nPlease find the scheduled "${reportName}" report attached.\n\nBest regards,\nYour MIS System`,
                html: `<p>Hello,</p><p>Please find the scheduled <strong>"${reportName}"</strong> report attached.</p><p>Best regards,<br>Your MIS System</p>`,
                attachments: [
                    {
                        filename,
                        content: buffer,
                        contentType: mimeType
                    }
                ]
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`[DELIVERY ADAPTER] ✅ Email sent successfully! Message ID: ${info.messageId}`);
            
            return { success: true };
        } catch (error: any) {
            console.error(`[DELIVERY ADAPTER] ❌ Failed to send email:`, error);
            // We return success: false instead of throwing so it doesn't crash the entire cron job loop
            return { success: false, error: error.message };
        }
    }

    if (channel === 'whatsapp') {
        // TODO: Add WhatsApp integration here in the future
        console.log(`[DELIVERY ADAPTER] ⚠️ WhatsApp delivery is not yet implemented.`);
        return { success: false, error: 'WhatsApp not implemented' };
    }

    return { success: true };
}
