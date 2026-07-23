/**
 * Link existing admissions to their doctor's user account.
 *
 * Why: admissions stores the doctor twice — doctor_name (free text, printed on the
 * bill) and attending_doctor_id (the link to the account). Only the text was ever
 * written, so attending_doctor_id is NULL on every historical admission. Two things
 * break as a result:
 *   - the Doctor Portal lists patients by attending_doctor_id, so it shows nothing
 *     for every doctor, including currently-admitted patients
 *   - the IPD commission fallback (attribute a bill to its attending doctor when
 *     invoices.doctor_id is unset) never fires
 *
 * createAdmission and the change-doctor action now populate the link going forward;
 * this repairs the rows written before that.
 *
 * Matching ignores title, case and punctuation ("DR. Yogesh Taneja " -> yogeshtaneja)
 * and prefers an active, non-merged account when duplicates normalise the same. A
 * name with no matching account is left alone and reported — never guessed at.
 *
 * Usage (dry run prints what would change, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/backfill-admission-attending-doctor.ts
 * Apply:
 *   DATABASE_URL="<url>" npx tsx scripts/backfill-admission-attending-doctor.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const norm = (s: unknown) =>
    String(s ?? '')
        .toLowerCase()
        .replace(/\[merged\]/g, '')
        .replace(/\b(dr|doctor|prof|mr|mrs|ms)\b\.?/g, '')
        .replace(/[^a-z0-9]/g, '');

async function main() {
    const doctors = await prisma.user.findMany({
        where: { role: 'doctor' },
        select: { id: true, name: true, username: true, organizationId: true, is_active: true },
    });

    // One preferred account per (org, normalised name).
    const byKey = new Map<string, (typeof doctors)[number]>();
    for (const d of doctors) {
        const k = `${d.organizationId}::${norm(d.name || d.username)}`;
        const prev = byKey.get(k);
        const better =
            !prev ||
            (!prev.is_active && d.is_active) ||
            (/^\s*\[MERGED\]/i.test(prev.name || '') && !/^\s*\[MERGED\]/i.test(d.name || ''));
        if (better) byKey.set(k, d);
    }

    const admissions = await prisma.admissions.findMany({
        where: { attending_doctor_id: null },
        select: { admission_id: true, doctor_name: true, organizationId: true, status: true },
    });

    const matched: Array<{ admission_id: string; doctor_id: string; doctor: string; status: string }> = [];
    const unmatched = new Map<string, number>();

    for (const a of admissions) {
        const hit = byKey.get(`${a.organizationId}::${norm(a.doctor_name)}`);
        if (hit) {
            matched.push({ admission_id: a.admission_id, doctor_id: hit.id, doctor: hit.name || hit.username || '', status: a.status });
        } else {
            const k = a.doctor_name?.trim() || '(blank)';
            unmatched.set(k, (unmatched.get(k) || 0) + 1);
        }
    }

    const admittedNow = matched.filter((m) => m.status === 'Admitted').length;
    console.log(`Admissions with no linked doctor : ${admissions.length}`);
    console.log(`  matchable by name              : ${matched.length}  (${admittedNow} currently Admitted)`);
    console.log(`  no matching doctor account     : ${admissions.length - matched.length}`);
    console.log(`Mode : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);

    if (unmatched.size) {
        console.log('\n  Unmatched doctor_name values — no account exists, left untouched:');
        [...unmatched.entries()]
            .sort((a, b) => b[1] - a[1])
            .forEach(([n, c]) => console.log(`     ${n.padEnd(34)} x${c}`));
    }

    if (!APPLY) {
        console.log('\nDry run — nothing written. Re-run with --apply to link them.');
        return;
    }

    for (const m of matched) {
        await prisma.admissions.update({
            where: { admission_id: m.admission_id },
            data: { attending_doctor_id: m.doctor_id },
        });
    }
    console.log(`\nLinked ${matched.length} admission(s).`);

    const perDoctor = await prisma.$queryRaw<Array<{ doctor: string; c: bigint }>>`
        SELECT u.name AS doctor, count(*) AS c
        FROM admissions a JOIN users u ON u.id = a.attending_doctor_id
        WHERE a.status = 'Admitted'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
    console.log('\nCurrently-admitted patients now visible per doctor:');
    perDoctor.forEach((r) => console.log(`   ${String(r.doctor).padEnd(30)} ${Number(r.c)}`));
}

main()
    .catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
