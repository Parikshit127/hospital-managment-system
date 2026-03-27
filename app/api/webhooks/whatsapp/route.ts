import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/backend/db';

// ========================================
// WhatsApp Webhook — Verification (GET)
// ========================================

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
        console.warn('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[WhatsApp Webhook] Verification successful');
        return new NextResponse(challenge, { status: 200 });
    }

    console.warn('[WhatsApp Webhook] Verification failed — token mismatch');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ========================================
// WhatsApp Webhook — Incoming Events (POST)
// ========================================

function verifySignature(rawBody: string, signature: string | null): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return false;
    if (!signature) return false;

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

interface WhatsAppStatus {
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
    errors?: { code: number; title: string }[];
}

interface WhatsAppMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
}

interface WhatsAppChange {
    value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        statuses?: WhatsAppStatus[];
        messages?: WhatsAppMessage[];
    };
    field: string;
}

interface WhatsAppWebhookPayload {
    object: string;
    entry: {
        id: string;
        changes: WhatsAppChange[];
    }[];
}

export async function POST(request: NextRequest) {
    // Always return 200 quickly — Meta retries on non-200
    try {
        const rawBody = await request.text();

        // Verify signature if app secret is configured
        if (process.env.WHATSAPP_APP_SECRET) {
            const signature = request.headers.get('x-hub-signature-256');
            if (!verifySignature(rawBody, signature)) {
                console.warn('[WhatsApp Webhook] Invalid signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

        if (payload.object !== 'whatsapp_business_account') {
            return NextResponse.json({ status: 'ignored' }, { status: 200 });
        }

        // Process entries in background (non-blocking)
        processWebhookEntries(payload.entry).catch(err =>
            console.error('[WhatsApp Webhook] Background processing error:', err)
        );

        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        console.error('[WhatsApp Webhook] Error:', error);
        // Still return 200 to prevent Meta retries on parse errors
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
}

// ========================================
// Background Processing
// ========================================

async function processWebhookEntries(entries: WhatsAppWebhookPayload['entry']) {
    for (const entry of entries) {
        for (const change of entry.changes) {
            if (change.field !== 'messages') continue;
            const value = change.value;

            // Process delivery status updates
            if (value.statuses && value.statuses.length > 0) {
                await processStatusUpdates(value.statuses);
            }

            // Process incoming messages
            if (value.messages && value.messages.length > 0) {
                await processIncomingMessages(value.messages, value.metadata.phone_number_id);
            }
        }
    }
}

async function processStatusUpdates(statuses: WhatsAppStatus[]) {
    for (const status of statuses) {
        try {
            // Update existing delivery log entry
            const existing = await prisma.messageDeliveryLog.findFirst({
                where: { message_id: status.id },
            });

            if (existing) {
                await prisma.messageDeliveryLog.update({
                    where: { id: existing.id },
                    data: {
                        status: status.status, // sent, delivered, read, failed
                        error_detail: status.errors?.[0]?.title || null,
                    },
                });
            } else {
                // Create a new entry if we don't have a matching outbound record
                // This can happen if the message was sent before tracking was enabled
                await prisma.messageDeliveryLog.create({
                    data: {
                        organizationId: 'unknown', // Will be updated when we can resolve it
                        message_id: status.id,
                        patient_phone: status.recipient_id,
                        channel: 'whatsapp',
                        event_type: 'unknown',
                        status: status.status,
                        error_detail: status.errors?.[0]?.title || null,
                    },
                });
            }
        } catch (err) {
            console.error(`[WhatsApp Webhook] Failed to process status ${status.id}:`, err);
        }
    }
}

async function processIncomingMessages(messages: WhatsAppMessage[], phoneNumberId: string) {
    // Resolve organization from the phone number ID
    let organizationId = 'unknown';
    try {
        const config = await prisma.organizationConfig.findFirst({
            where: { whatsapp_phone_id: phoneNumberId },
            select: { organizationId: true },
        });
        if (config) organizationId = config.organizationId;
    } catch { /* use default */ }

    for (const msg of messages) {
        try {
            await prisma.whatsAppIncomingMessage.create({
                data: {
                    organizationId,
                    from_phone: msg.from,
                    message_type: msg.type,
                    message_body: msg.text?.body || null,
                    wa_message_id: msg.id,
                    timestamp: new Date(parseInt(msg.timestamp) * 1000),
                },
            });
        } catch (err) {
            // Skip duplicate messages (unique constraint on wa_message_id)
            if (err instanceof Error && err.message.includes('Unique constraint')) {
                continue;
            }
            console.error(`[WhatsApp Webhook] Failed to store message ${msg.id}:`, err);
        }
    }
}
