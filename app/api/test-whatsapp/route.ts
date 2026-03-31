import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/app/lib/whatsapp';

/**
 * Test endpoint to verify WhatsApp API configuration
 *
 * Usage:
 * POST /api/test-whatsapp
 * Body: { "phone": "9876543210", "message": "Test message" }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, message } = body;

        if (!phone || !message) {
            return NextResponse.json({
                success: false,
                error: 'Phone and message are required'
            }, { status: 400 });
        }

        console.log('[Test WhatsApp] Testing with phone:', phone);

        const result = await sendWhatsAppMessage(phone, message);

        return NextResponse.json({
            success: result.success !== false,
            result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Test WhatsApp] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * GET endpoint to check WhatsApp configuration
 */
export async function GET() {
    const hasToken = !!process.env.WHATSAPP_API_TOKEN;
    const hasPhoneId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
    const hasAppSecret = !!process.env.WHATSAPP_APP_SECRET;
    const hasWebhookToken = !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    return NextResponse.json({
        configured: hasToken && hasPhoneId,
        details: {
            WHATSAPP_API_TOKEN: hasToken ? `Set (${process.env.WHATSAPP_API_TOKEN?.substring(0, 10)}...)` : 'Not set',
            WHATSAPP_PHONE_NUMBER_ID: hasPhoneId ? process.env.WHATSAPP_PHONE_NUMBER_ID : 'Not set',
            WHATSAPP_APP_SECRET: hasAppSecret ? 'Set' : 'Not set',
            WHATSAPP_WEBHOOK_VERIFY_TOKEN: hasWebhookToken ? 'Set' : 'Not set',
        },
        apiUrl: `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
    });
}
