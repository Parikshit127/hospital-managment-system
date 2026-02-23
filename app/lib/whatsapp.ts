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

export async function sendAppointmentReminder(phone: string, patientName: string, doctorName: string, time: string) {
    return sendWhatsAppMessage(phone,
        `*Avani Hospital Reminder*\n\nDear ${patientName},\n\nYour appointment with *Dr. ${doctorName}* is confirmed for *${time}*.\n\nPlease bring your Patient ID card.\n\nFor queries, call reception.`
    )
}

export async function sendLabReportReady(phone: string, patientName: string, testName: string) {
    return sendWhatsAppMessage(phone,
        `*Avani Hospital — Lab Report Ready*\n\nDear ${patientName},\n\nYour *${testName}* report is ready. Please collect from the Lab or view online.\n\nThank you.`
    )
}

export async function sendDischargeSummary(phone: string, patientName: string) {
    return sendWhatsAppMessage(phone,
        `*Avani Hospital — Discharge Summary*\n\nDear ${patientName},\n\nYour discharge summary has been prepared. Please collect from the reception or we will email it to you shortly.\n\nWishing you a speedy recovery!`
    )
}
