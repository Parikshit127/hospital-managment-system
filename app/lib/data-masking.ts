/**
 * Data masking utilities for patient privacy.
 * Used to obscure sensitive PII in non-essential views.
 */

/** Mask phone: 9876543210 → 9876****10 */
export function maskPhone(phone: string | null | undefined): string {
    if (!phone) return '—';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return '****';
    return digits.slice(0, 4) + '****' + digits.slice(-2);
}

/** Mask email: john.doe@email.com → jo****@email.com */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return '—';
    const [local, domain] = email.split('@');
    if (!domain) return '****';
    const visible = local.slice(0, 2);
    return `${visible}****@${domain}`;
}

/** Mask Aadhar: 1234 5678 9012 → **** **** 9012 */
export function maskAadhar(aadhar: string | null | undefined): string {
    if (!aadhar) return '—';
    const digits = aadhar.replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return '**** **** ' + digits.slice(-4);
}
