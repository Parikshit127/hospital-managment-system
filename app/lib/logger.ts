/**
 * Safe server-side logger with PII/PHI redaction.
 *
 * Why this exists:
 *  - HospitalOS handles patient PII/PHI (phone, email, names, IDs). Logging these
 *    raw to PM2/stdout persists them in plaintext log files — a compliance and
 *    privacy risk. Use the mask* helpers before logging any identifier.
 *  - `info`/`debug` are suppressed in production unless LOG_LEVEL=debug, to keep
 *    production logs quiet and avoid accidental data exposure. `warn`/`error`
 *    always emit so operational failures are never silently dropped.
 *
 * Usage:
 *   import { logger, maskPhone, maskEmail } from '@/app/lib/logger';
 *   logger.info(`[SMS] dispatch to ${maskPhone(payload.to)}`);
 *
 * NOTE: server-only. Do not import into client components.
 */

const isProd = process.env.NODE_ENV === 'production';
const debugEnabled = process.env.LOG_LEVEL === 'debug';

/** Mask a phone number, revealing only the last 4 digits. */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '[no-phone]';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/** Mask an email, revealing only the first 2 local chars and the domain. */
export function maskEmail(email?: string | null): string {
  if (!email) return '[no-email]';
  const str = String(email);
  const at = str.indexOf('@');
  if (at < 1) return '[redacted-email]';
  const local = str.slice(0, at);
  const domain = str.slice(at);
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}${domain}`;
}

/**
 * Redact obvious PII fields from an arbitrary object before logging.
 * Returns a shallow-cleaned copy; does not mutate the input.
 */
const PII_KEYS = new Set([
  'phone', 'mobile', 'to', 'destination', 'contact', 'contact_number',
  'email', 'full_name', 'name', 'first_name', 'last_name',
  'aadhaar', 'aadhar', 'dob', 'date_of_birth', 'address', 'message',
]);

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[depth-limit]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (lk.includes('phone') || lk.includes('mobile') || lk === 'to' || lk === 'destination') {
        out[k] = maskPhone(v as string);
      } else if (lk.includes('email')) {
        out[k] = maskEmail(v as string);
      } else if (PII_KEYS.has(lk)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProd || debugEnabled) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProd || debugEnabled) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
