import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_PER_HOUR = 3;

/** Generate a random 6-digit OTP */
export function generateOTP(): string {
    const max = Math.pow(10, OTP_LENGTH);
    const min = Math.pow(10, OTP_LENGTH - 1);
    const otp = crypto.randomInt(min, max);
    return otp.toString();
}

/** Hash OTP for storage (SHA256) */
export function hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

/** Verify OTP matches hash */
export function verifyOTPHash(otp: string, hash: string): boolean {
    return hashOTP(otp) === hash;
}

/** Get expiry timestamp from now */
export function getOTPExpiry(): Date {
    return new Date(Date.now() + OTP_EXPIRY_MS);
}

export { MAX_OTP_PER_HOUR };
