import { createHmac } from 'crypto';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
const SECRET: string = process.env.JWT_SECRET;
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a signed token for a lab report URL.
 * Token = base64url(JSON({ barcode, orgId, exp })) + '.' + hmac-signature
 */
export function generateSignedReportToken(
    barcode: string,
    organizationId: string,
    expiryMs: number = DEFAULT_EXPIRY_MS,
): string {
    const payload = {
        b: barcode,
        o: organizationId,
        exp: Date.now() + expiryMs,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

/**
 * Verify a signed report token. Returns payload if valid, null otherwise.
 */
export function verifySignedReportToken(
    token: string,
): { barcode: string; organizationId: string } | null {
    try {
        const [data, sig] = token.split('.');
        if (!data || !sig) return null;

        const expectedSig = createHmac('sha256', SECRET).update(data).digest('base64url');
        if (sig !== expectedSig) return null;

        const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
        if (payload.exp < Date.now()) return null;

        return { barcode: payload.b, organizationId: payload.o };
    } catch {
        return null;
    }
}
