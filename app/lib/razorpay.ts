import Razorpay from "razorpay";

let razorpayInstance: Razorpay | null = null;

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET.",
    );
  }

  return { keyId, keySecret };
}

export function getRazorpayClient() {
  if (razorpayInstance) return razorpayInstance;

  const { keyId, keySecret } = getRazorpayConfig();
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayInstance;
}
