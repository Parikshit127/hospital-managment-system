import { NextResponse } from 'next/server';

/**
 * WhatsApp Webhook Endpoint
 * 
 * GET: Verification from Meta (Hub challenge)
 * POST: Incoming messaging events and status updates
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('[WhatsApp Webhook] Verification successful');
        return new Response(challenge, { status: 200 });
    }

    console.warn('[WhatsApp Webhook] Verification failed — tokens do not match');
    return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // Log incoming message for debugging
        console.log('[WhatsApp Webhook] Received event:', JSON.stringify(body, null, 2));

        // Note: In a production app, you would parse the body to handle specific events:
        // - body.entry[0].changes[0].value.messages (Incoming messages)
        // - body.entry[0].changes[0].value.statuses (Status updates: sent, delivered, read)

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[WhatsApp Webhook] Error processing event:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
