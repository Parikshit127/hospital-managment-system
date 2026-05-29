import { NextRequest, NextResponse } from "next/server";
import { logger, maskPhone } from "@/app/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, data } = body;

    // Track delivery status updates from AiSensy
    if (topic === "message.status.updated") {
      const { messageId, status, to } = data;
      logger.info(`[WhatsApp Webhook] Status update: ${messageId} -> ${status} (to: ${maskPhone(to)})`);

      if (status === "failed") {
        logger.warn(`[WhatsApp] Delivery failed to: ${maskPhone(to)}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
