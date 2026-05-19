import Razorpay from "razorpay";
import { getRazorpayCredentials } from "@/app/lib/secure-config";

const razorpayInstances = new Map<string, Razorpay>();

export async function getRazorpayClient(organizationId: string) {
  const { keyId, keySecret } = await getRazorpayCredentials(organizationId);
  const cacheKey = `${organizationId}:${keyId}`;
  const cached = razorpayInstances.get(cacheKey);
  if (cached) return cached;

  const client = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  razorpayInstances.set(cacheKey, client);
  return client;
}

export async function getRazorpayPublicKey(organizationId: string) {
  const { keyId } = await getRazorpayCredentials(organizationId);
  return keyId;
}

export async function getRazorpaySigningSecret(organizationId: string) {
  const { keySecret } = await getRazorpayCredentials(organizationId);
  return keySecret;
}
