const REQUIRED_SERVER_ENV = ['JWT_SECRET', 'DATABASE_URL', 'DIRECT_URL'] as const;

const OPTIONAL_INTEGRATION_GROUPS = [
    ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID'],
    ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
] as const;

let validated = false;

function findMissing(keys: readonly string[]): string[] {
    return keys.filter((key) => !process.env[key] || process.env[key]?.trim() === '');
}

function validateIntegrationGroups(): string[] {
    const groupErrors: string[] = [];

    for (const group of OPTIONAL_INTEGRATION_GROUPS) {
        const configured = group.some((key) => (process.env[key] || '').trim() !== '');
        if (!configured) continue;

        const missing = findMissing(group);
        if (missing.length > 0) {
            groupErrors.push(`Integration group missing required keys: ${missing.join(', ')}`);
        }
    }

    return groupErrors;
}

export function validateServerEnv() {
    if (validated) return;

    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
        validated = true;
        return;
    }

    const missingCore = findMissing(REQUIRED_SERVER_ENV);
    const integrationErrors = validateIntegrationGroups();

    if (missingCore.length > 0 || integrationErrors.length > 0) {
        const messages: string[] = [];
        if (missingCore.length > 0) {
            messages.push(`Missing required environment variables: ${missingCore.join(', ')}`);
        }
        messages.push(...integrationErrors);
        throw new Error(`Environment validation failed. ${messages.join(' | ')}`);
    }

    validated = true;
}

