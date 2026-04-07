const COMBIRDS_BASE_URL = process.env.COMBIRDS_BASE_URL || "https://backend.aisensy.com/campaign/t1/api";
const AISENSY_API_KEY = process.env.AISENSY_API_KEY || "";

export interface WhatsAppMessage {
  to: string;
  message: string;
  mediaUrl?: string;
}

export interface WhatsAppTemplate {
  to: string;
  templateName: string;
  userName?: string;
  params?: string[];
  mediaUrl?: string;
}

export interface WhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Send a DIRECT session message (only works if 24h window is open)
 */
export async function sendWhatsAppMessage(
  payload: WhatsAppMessage
): Promise<WhatsAppResponse> {
  try {
    if (!AISENSY_API_KEY) {
      console.warn('[WhatsApp] AISENSY_API_KEY not configured — skipping');
      return { success: false, skipped: true };
    }

    // Session messages use the base domain, not the campaign path
    const baseOrigin = new URL(COMBIRDS_BASE_URL).origin;
    const endpoint = `${baseOrigin}/v1/sendsessionmessage`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AISENSY_API_KEY}`,
      },
      body: JSON.stringify({
        apiKey: AISENSY_API_KEY,
        destination: payload.to,
        message: {
          type: "text",
          text: payload.message
        },
      }),
    });

    if (!response.ok) {
      // Session messaging not available — fall back to generic template
      console.warn("WhatsApp session failed, falling back to template");
      return sendWhatsAppTemplate({
        to: payload.to,
        templateName: 'generic_hospital_update',
        userName: 'Patient',
        params: [
          process.env.HOSPITAL_NAME || 'Hospital',
          'Patient',
          payload.message,
          process.env.HOSPITAL_NAME || 'Hospital'
        ]
      });
    }

    const data = await response.json();
    console.log(`[WhatsApp] Session Message sent to ${payload.to}`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    // Fall back to template on any error
    console.warn("WhatsApp session error, falling back to template:", error);
    return sendWhatsAppTemplate({
      to: payload.to,
      templateName: 'generic_hospital_update',
      userName: 'Patient',
      params: [
        process.env.HOSPITAL_NAME || 'Hospital',
        'Patient',
        payload.message,
        process.env.HOSPITAL_NAME || 'Hospital'
      ]
    });
  }
}

/**
 * Send a TEMPLATE campaign (use this for first-time notifications)
 */
export async function sendWhatsAppTemplate(
  payload: WhatsAppTemplate
): Promise<WhatsAppResponse> {
  try {
    if (!AISENSY_API_KEY) {
      console.warn('[WhatsApp] AISENSY_API_KEY not configured — skipping');
      return { success: false, skipped: true };
    }

    const endpoint = `${COMBIRDS_BASE_URL}/v2`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AISENSY_API_KEY}`,
      },
      body: JSON.stringify({
        apiKey: AISENSY_API_KEY,
        campaignName: payload.templateName,
        destination: payload.to,
        userName: payload.userName || "Patient",
        templateParams: payload.params || [],
        ...(payload.mediaUrl && { mediaUrl: payload.mediaUrl, mediaType: "image" }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("WhatsApp template send failed:", error);
      return { success: false, error };
    }

    const data = await response.json();
    console.log(`[WhatsApp] Template '${payload.templateName}' sent to ${payload.to}`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error("WhatsApp template service error:", error);
    return { success: false, error: String(error) };
  }
}

// Helper: Format phone number for WhatsApp
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (!cleaned.startsWith("+") && !cleaned.startsWith("91")) {
    cleaned = "91" + cleaned;
  }
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}
