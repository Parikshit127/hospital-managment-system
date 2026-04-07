import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, data } = body;

    // Track delivery status updates from AiSensy
    if (topic === "message.status.updated") {
      const { messageId, status, to } = data;
      console.log(`[WhatsApp Webhook] Status update: ${messageId} -> ${status} (to: ${to})`);

      if (status === "failed") {
        console.warn(`[WhatsApp] Delivery failed to: ${to}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
