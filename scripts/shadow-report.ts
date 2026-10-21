/**
 * Summarise access_shadow_logs: where the NEW access engine disagreed with the OLD checks (read-only).
 *
 *   npx tsx scripts/shadow-report.ts [--days 7] [--unit-company <company-slug>] [--limit 25]
 *
 * Two directions matter:
 *   OLD allowed, NEW denies   → turning enforce on would LOCK THESE USERS OUT of that action.
 *   OLD denied,  NEW allows   → turning enforce on would OPEN access the old rules refused.
 * Exit code 1 when any disagreement exists, so it can gate the move from shadow to enforce.
 */
import { PrismaClient } from '@prisma/client';

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

async function main() {
    const prisma = new PrismaClient();
    const days = Number(opt('--days', '7')), limit = Number(opt('--limit', '25'));
    const since = new Date(Date.now() - days * 86_400_000);
    const company = opt('--unit-company', '');
    const where: Record<string, unknown> = { created_at: { gte: since } };
    if (company) { const c = await prisma.company.findUnique({ where: { slug: company } }); if (!c) { console.error('No such company'); process.exit(2); } where.company_id = c.id; }

    const rows = await prisma.accessShadowLog.findMany({ where, orderBy: { created_at: 'desc' } });
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, role: true } });
    const who = new Map(users.map((u) => [u.id, `${u.username} (${u.role})`]));

    console.log(`Shadow disagreements, last ${days} day(s): ${rows.length}\n`);
    for (const [label, pick] of [
        ['OLD allowed → NEW denies  (enforce would LOCK OUT)', (r: (typeof rows)[number]) => r.legacy && !r.next],
        ['OLD denied  → NEW allows  (enforce would OPEN UP)', (r: (typeof rows)[number]) => !r.legacy && r.next],
    ] as const) {
        const sel = rows.filter(pick);
        console.log(`${label}: ${sel.length}`);
        const byPerm = new Map<string, Map<string, number>>();
        for (const r of sel) {
            const m = byPerm.get(r.permission) ?? new Map<string, number>();
            m.set(who.get(r.user_id) ?? r.user_id, (m.get(who.get(r.user_id) ?? r.user_id) ?? 0) + 1);
            byPerm.set(r.permission, m);
        }
        for (const [perm, m] of [...byPerm.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, limit)) {
            console.log(`   ${perm.padEnd(34)} ${m.size} user(s): ${[...m.keys()].slice(0, 6).join(', ')}${m.size > 6 ? ', …' : ''}`);
        }
        console.log('');
    }
    await prisma.$disconnect();
    if (rows.length) process.exit(1);
    console.log('No disagreements ✔');
}
main().catch((e) => { console.error(e); process.exit(1); });
