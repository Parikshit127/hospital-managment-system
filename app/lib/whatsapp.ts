const WA_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

export async function sendWhatsAppMessage(to: string, message: string) {
    if (!process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.warn('[WhatsApp] API credentials not configured — skipping message')
        return { skipped: true }
    }

    const response = await fetch(WA_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/\D/g, ''),
            type: 'text',
            text: { body: message }
        })
    })
    return response.json()
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
