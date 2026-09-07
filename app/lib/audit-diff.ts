/**
 * Field-level before/after diffing for audit logs.
 *
 * `system_audit_logs.details` is a loosely-typed string column. This helper
 * produces a small, JSON-serializable array of `{ field, from, to }` entries
 * so callers of `logAudit()` / `logCriticalAction()` can capture "what
 * changed" alongside the existing who/when/what-entity columns, without any
 * schema change.
 *
 * Contract (matches the UI renderer another agent is building against):
 *   details column, when a diff is captured, holds:
 *     { "summary"?: string, "changes"?: [ { "field": string, "from": any, "to": any } ] }
 */

const NOISE_KEYS = new Set(['updated_at', 'updatedAt', 'id']);

/** Make a value JSON-serializable and stable for both comparison and storage. */
function normalizeValue(value: any): any {
    if (value === undefined) return null;
    if (value === null) return null;

    // Prisma Decimal (and any Decimal-like object exposing toNumber/toString)
    // and BigInt both need explicit conversion — JSON.stringify either throws
    // (BigInt) or leans on a possibly-surprising toJSON (Decimal).
    if (typeof value === 'bigint') return value.toString();

    if (value instanceof Date) return value.toISOString();

    // Prisma.Decimal instances are objects with a `toFixed`/`toNumber` method,
    // not plain numbers. Detect duck-typed Decimals without importing the
    // Prisma runtime type here.
    if (typeof value === 'object' && value !== null && typeof (value as any).toFixed === 'function' && typeof (value as any).toNumber === 'function') {
        try {
            return (value as any).toNumber();
        } catch {
            return value.toString();
        }
    }

    if (Array.isArray(value)) {
        return value.map(normalizeValue);
    }

    if (typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const k of Object.keys(value)) {
            out[k] = normalizeValue(value[k]);
        }
        return out;
    }

    return value;
}

function stableStringify(value: any): string {
    try {
        return JSON.stringify(normalizeValue(value));
    } catch {
        return String(value);
    }
}

/**
 * Compare the union of keys in `before`/`after` and return only the fields
 * that actually changed. Skips a small set of columns that would otherwise
 * always show up as "changed" noise (e.g. `updated_at`) on every diff.
 */
export function diffObjects(
    before: Record<string, any> | null | undefined,
    after: Record<string, any> | null | undefined
): { field: string; from: any; to: any }[] {
    const b = before ?? {};
    const a = after ?? {};

    const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
    const changes: { field: string; from: any; to: any }[] = [];

    for (const key of keys) {
        if (NOISE_KEYS.has(key)) continue;

        const fromRaw = b[key];
        const toRaw = a[key];

        if (stableStringify(fromRaw) === stableStringify(toRaw)) continue;

        changes.push({
            field: key,
            from: normalizeValue(fromRaw),
            to: normalizeValue(toRaw),
        });
    }

    return changes;
}
