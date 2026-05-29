import { getOrganizationIntegrationConfig } from '@/app/lib/secure-config';
import { logger, maskPhone } from '@/app/lib/logger';

export interface SMSPayload {
    to: string;
    message: string;
    organizationId?: string;
}

export interface SMSResponse {
    success: boolean;
    error?: string;
    skipped?: boolean;
}

/**
 * Send an SMS to the patient using organization-specific dynamic configs or fallback env vars
 */
export async function sendSMS(payload: SMSPayload): Promise<SMSResponse> {
    try {
        const config = payload.organizationId
            ? await getOrganizationIntegrationConfig(payload.organizationId)
            : null;

        const gatewayUrl = config?.sms_gateway_url || process.env.SMS_GATEWAY_URL;
        const apiKey = config?.sms_api_key || process.env.SMS_API_KEY;
        const senderId = config?.sms_sender_id || process.env.SMS_SENDER_ID || 'AVNHSP';

        if (!gatewayUrl || !apiKey) {
            console.warn('[SMS] Gateway URL or API Key not configured — skipping');
            return { success: false, skipped: true };
        }

        logger.info(`[SMS] Dispatching SMS to ${maskPhone(payload.to)} (Sender ID: ${senderId})`);

        const response = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                to: payload.to,
                message: payload.message,
                sender: senderId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[SMS] Gateway rejected message:', errorText);
            return { success: false, error: errorText };
        }

        return { success: true };
    } catch (error) {
        console.error('[SMS] Service error:', error);
        return { success: false, error: String(error) };
    }
}
