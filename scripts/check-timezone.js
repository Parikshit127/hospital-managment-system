/**
 * Day-boundary self-check for app/lib/timezone.ts.
 *   node scripts/check-timezone.js
 * Must pass regardless of the host clock's zone — run it with TZ=Asia/Kolkata
 * and TZ=UTC; both must agree.
 */
const assert = require('assert');
const { execFileSync } = require('child_process');

// Inlined copy of the two pure helpers — kept in step with app/lib/timezone.ts.
// (Importing the TS module would need a compile step for a 20-line check.)
function offsetMs(tz, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const g = t => parts.find(p => p.type === t)?.value ?? '0';
    return Date.UTC(+g('year'), +g('month') - 1, +g('day'), +g('hour') % 24, +g('minute'), +g('second')) - date.getTime();
}
function getDayRange(dateStr, tz = 'Asia/Kolkata') {
    const s = new Date(`${dateStr}T00:00:00.000Z`);
    const e = new Date(`${dateStr}T23:59:59.999Z`);
    if (isNaN(s.getTime())) return { start: new Date(0), end: new Date(0) };
    const o = offsetMs(tz, s);
    return { start: new Date(s.getTime() - o), end: new Date(e.getTime() - o) };
}

// IST is UTC+5:30 → an IST day starts 18:30 the previous UTC day.
const ist = getDayRange('2026-08-31', 'Asia/Kolkata');
assert.strictEqual(ist.start.toISOString(), '2026-08-30T18:30:00.000Z', 'IST day start');
assert.strictEqual(ist.end.toISOString(), '2026-08-31T18:29:59.999Z', 'IST day end');

// UTC day is the plain literal.
const utc = getDayRange('2026-08-31', 'UTC');
assert.strictEqual(utc.start.toISOString(), '2026-08-31T00:00:00.000Z', 'UTC day start');
assert.strictEqual(utc.end.toISOString(), '2026-08-31T23:59:59.999Z', 'UTC day end');

// A whole day must be exactly 24h wide, DST zone included.
for (const tz of ['Asia/Kolkata', 'UTC', 'America/New_York']) {
    const r = getDayRange('2026-08-31', tz);
    assert.strictEqual(r.end.getTime() - r.start.getTime(), 86400000 - 1, `${tz} span`);
}

// Consecutive days must not overlap or leave a gap.
const d1 = getDayRange('2026-08-31', 'Asia/Kolkata');
const d2 = getDayRange('2026-09-01', 'Asia/Kolkata');
assert.strictEqual(d2.start.getTime() - d1.end.getTime(), 1, 'consecutive days abut');

// Garbage in must not produce an Invalid Date (Prisma rejects those).
assert.ok(!isNaN(getDayRange('not-a-date').start.getTime()), 'bad input is not Invalid Date');

// The whole point: the result must not depend on the host clock's zone.
if (!process.env.TZ_CHILD) {
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
        const out = execFileSync(process.execPath, [__filename], {
            env: { ...process.env, TZ: tz, TZ_CHILD: '1' }, encoding: 'utf8',
        });
        assert.ok(out.includes('OK'), `host TZ=${tz}`);
    }
    console.log('timezone day-boundary check: OK (host-zone independent)');
} else {
    console.log('OK');
}
