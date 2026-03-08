type AttemptRecord = {
    failedCount: number;
    firstFailedAt: number;
    lockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

function normalizeIp(rawIp: string) {
    return rawIp.split(',')[0]?.trim() || 'unknown';
}

function keyFor(username: string, ip: string) {
    return `${username.toLowerCase()}::${normalizeIp(ip)}`;
}

export function checkLoginAttempt(username: string, ip: string) {
    const key = keyFor(username, ip);
    const now = Date.now();
    const record = attempts.get(key);

    if (!record) {
        return { blocked: false, retryAfterMs: 0 };
    }

    if (record.lockedUntil > now) {
        return { blocked: true, retryAfterMs: record.lockedUntil - now };
    }

    if (now - record.firstFailedAt > WINDOW_MS) {
        attempts.delete(key);
        return { blocked: false, retryAfterMs: 0 };
    }

    return { blocked: false, retryAfterMs: 0 };
}

export function recordLoginFailure(username: string, ip: string) {
    const key = keyFor(username, ip);
    const now = Date.now();
    const current = attempts.get(key);

    if (!current || now - current.firstFailedAt > WINDOW_MS) {
        attempts.set(key, {
            failedCount: 1,
            firstFailedAt: now,
            lockedUntil: 0,
        });
        return;
    }

    const failedCount = current.failedCount + 1;
    const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? now + LOCK_MS : 0;

    attempts.set(key, {
        failedCount,
        firstFailedAt: current.firstFailedAt,
        lockedUntil,
    });
}

export function clearLoginFailures(username: string, ip: string) {
    attempts.delete(keyFor(username, ip));
}

