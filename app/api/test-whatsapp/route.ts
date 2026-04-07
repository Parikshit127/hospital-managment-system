import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, sendWhatsAppTemplate, formatPhoneNumber } from '@/app/lib/whatsapp';

/**
 * Test endpoint to verify WhatsApp API configuration (AiSensy/Combirds)
 *
 * Usage:
 * POST /api/test-whatsapp
 * Body: { "phone": "9876543210", "message": "Test message" }
 * OR for template: { "phone": "9876543210", "template": "welcome_msg", "params": ["Hospital", "Patient"] }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, message, template, params } = body;

        if (!phone) {
            return NextResponse.json({
                success: false,
                error: 'Phone is required'
            }, { status: 400 });
        }

        const formattedPhone = formatPhoneNumber(phone);
        console.log('[Test WhatsApp] Testing with phone:', formattedPhone);

        let result;
        if (template) {
            result = await sendWhatsAppTemplate({
                to: formattedPhone,
                templateName: template,
                userName: 'Test Patient',
                params: params || [],
            });
        } else {
            result = await sendWhatsAppMessage({
                to: formattedPhone,
                message: message || 'Test message from Hospital OS',
            });
        }

        return NextResponse.json({
            success: result.success,
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
    const hasApiKey = !!process.env.AISENSY_API_KEY;
    const hasBaseUrl = !!process.env.COMBIRDS_BASE_URL;

    return NextResponse.json({
        configured: hasApiKey,
        provider: 'AiSensy/Combirds',
        details: {
            AISENSY_API_KEY: hasApiKey ? 'Set' : 'Not set',
            COMBIRDS_BASE_URL: process.env.COMBIRDS_BASE_URL || 'Using default',
            HOSPITAL_NAME: process.env.HOSPITAL_NAME || 'Not set',
        },
    });
}
