const WA_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

export async function sendWhatsAppMessage(to: string, message: string) {
    if (!process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.warn('[WhatsApp] API credentials not configured — skipping message')
        return { skipped: true }
    }

    // Clean and format phone number - must include country code
    let phoneNumber = to.replace(/\D/g, '');

    // If phone starts with 91 (India), keep it; otherwise add 91 prefix
    if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
        phoneNumber = '91' + phoneNumber;
    }

    console.log('[WhatsApp] Attempting to send message to:', phoneNumber);
    console.log('[WhatsApp] Using Phone Number ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);

    try {
        const response = await fetch(WA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: 'text',
                text: { body: message }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[WhatsApp] API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                error: data
            });
            return {
                success: false,
                error: data.error?.message || 'Unknown error',
                details: data
            };
        }

        console.log('[WhatsApp] Message sent successfully:', {
            to: phoneNumber,
            messageId: data.messages?.[0]?.id
        });

        return { success: true, data };
    } catch (error) {
        console.error('[WhatsApp] Network or fetch error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error'
        };
    }
}

export async function sendAppointmentReminder(phone: string, patientName: string, doctorName: string, time: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} Reminder*\n\nDear ${patientName},\n\nYour appointment with *Dr. ${doctorName}* is confirmed for *${time}*.\n\nPlease bring your Patient ID card.\n\nFor queries, call reception.`
    )
}

export async function sendLabReportReady(phone: string, patientName: string, testName: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Lab Report Ready*\n\nDear ${patientName},\n\nYour *${testName}* report is ready. Please collect from the Lab or view online.\n\nThank you.`
    )
}

export async function sendDischargeSummary(phone: string, patientName: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Discharge Summary*\n\nDear ${patientName},\n\nYour discharge summary has been prepared. Please collect from the reception or we will email it to you shortly.\n\nWishing you a speedy recovery!`
    )
}

// ========================================
// OPD Queue WhatsApp Notifications
// ========================================

export async function sendQueueToken(phone: string, patientName: string, tokenNumber: number, doctorName: string, position: number, estimatedWait: number, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Queue Token*\n\nDear ${patientName},\n\nYour token number is *#${tokenNumber}*.\nDoctor: *Dr. ${doctorName}*\nQueue position: *${position}*\nEstimated wait: *~${estimatedWait} min*\n\nYou will be notified when it's your turn.`
    )
}

export async function sendQueueUpdate(phone: string, patientName: string, newPosition: number, estimatedWait: number, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Queue Update*\n\nDear ${patientName},\n\nYour queue position: *${newPosition}*\nEstimated wait: *~${estimatedWait} min*`
    )
}

export async function sendYourTurnAlert(phone: string, patientName: string, doctorName: string, roomNumber: string = '', hospitalName: string = 'Hospital') {
    const roomInfo = roomNumber ? `\nRoom: *${roomNumber}*` : '';
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Your Turn!*\n\nDear ${patientName},\n\nPlease proceed to *Dr. ${doctorName}*'s consultation room.${roomInfo}\n\nThank you for your patience.`
    )
}

// ========================================
// Email Mirroring Templates
// ========================================

export async function sendWelcomeMessage(phone: string, patientName: string, patientId: string, setupLink: string, hospitalName: string = 'Avani Hospital') {
    return sendWhatsAppMessage(phone,
        `*Welcome to ${hospitalName}*\n\nDear ${patientName},\n\nYour registration is complete. Use the link below to set your portal password.\n\n*Patient ID:* ${patientId}\n*Setup Link:* ${setupLink}\n\nThank you.`
    )
}

export async function sendPrescriptionMessage(phone: string, patientName: string, doctorName: string, diagnosis: string, hospitalName: string = 'Avani Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Prescription*\n\nDear ${patientName},\n\nDr. ${doctorName} has added a new clinical summary.\n\n*Diagnosis:* ${diagnosis}\n\nView details in your Patient Portal.`
    )
}

export async function sendAdmissionMessage(phone: string, patientName: string, bedDetails: string, doctorName: string, hospitalName: string = 'Avani Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Admission Confirmation*\n\nDear ${patientName},\n\nYou have been admitted under the care of *Dr. ${doctorName}*.\n\n*Bed Assignment:* ${bedDetails}\n\nTrack your status in the Patient Portal.`
    )
}

export async function sendPillReminderMessage(phone: string, patientName: string, medicationName: string, dosage: string, notes?: string | null, hospitalName: string = 'Avani Hospital') {
    const noteStr = notes ? `\n*Note:* ${notes}` : '';
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Medication Reminder*\n\nDear ${patientName},\n\nIt's time for your medication:\n\n*Medication:* ${medicationName}\n*Dosage:* ${dosage}${noteStr}\n\nPlease take it on time.`
    )
}

// ========================================
// Clinical & Billing WhatsApp Notifications
// ========================================

export async function sendPrescriptionWhatsApp(phone: string, patientName: string, doctorName: string, summaryText: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Prescription Ready*\n\nDear ${patientName},\n\nDr. ${doctorName} has added a new prescription to your record.\n\n${summaryText}\n\nView details in your Patient Portal.`
    )
}

export async function sendAdmissionWhatsApp(phone: string, patientName: string, doctorName: string, bedDetails: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Admission Confirmed*\n\nDear ${patientName},\n\nYou have been admitted under *Dr. ${doctorName}*.\nBed: *${bedDetails}*\n\nTrack your vitals and billing in the Patient Portal.\n\nWishing you a speedy recovery!`
    )
}

export async function sendPillReminderWhatsApp(phone: string, patientName: string, medicationName: string, dosage: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Medication Reminder* 💊\n\nDear ${patientName},\n\nIt's time for your medication:\n*${medicationName}* — ${dosage}\n\nPlease take your medicine on time.`
    )
}

export async function sendInvoiceWhatsApp(phone: string, patientName: string, invoiceNumber: string, amount: string, hospitalName: string = 'Hospital') {
    return sendWhatsAppMessage(phone,
        `*${hospitalName} — Invoice Generated*\n\nDear ${patientName},\n\nInvoice *#${invoiceNumber}* for *₹${amount}* has been generated.\n\nYou can view and pay online via the Patient Portal.\n\nThank you.`
    )
}
