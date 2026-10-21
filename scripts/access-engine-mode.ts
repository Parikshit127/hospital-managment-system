/**
 * Show or change a unit's (or company's / the platform's) `access_engine` mode.
 *
 *   npx tsx scripts/access-engine-mode.ts --show                                  # every explicit setting + the units' effective mode
 *   npx tsx scripts/access-engine-mode.ts --unit hosp-a --set shadow --yes        # one unit (by slug or id)
 *   npx tsx scripts/access-engine-mode.ts --company axten --set shadow --yes      # whole company
 *   npx tsx scripts/access-engine-mode.ts --platform --set legacy --yes
 *   npx tsx scripts/access-engine-mode.ts --unit hosp-a --clear --yes             # remove → falls back to the next level
 *
 * Resolution order (most specific wins): unit → company → platform → 'legacy'.
 * Read-only unless --yes is given. Flags are cached ~30 s per server process, so a change takes effect within
 * half a minute without a restart.
 */
import { PrismaClient } from '@prisma/client';

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const has = (n: string) => argv.includes(n);
const MODES = ['legacy', 'shadow', 'enforce'];

async function main() {
    const prisma = new PrismaClient();
    const host = (() => { try { return new URL((process.env.DATABASE_URL ?? '').replace(/^postgres(ql)?:/, 'http:')).host; } catch { return '?'; } })();
    console.log(`Database host: ${host}`);

    const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, name: true, company_id: true }, orderBy: { name: 'asc' } });
    const companies = await prisma.company.findMany({ select: { id: true, slug: true } });
    const flags = await prisma.featureFlag.findMany({ where: { key: 'access_engine' } });
    const flagOf = (t: string, id: string) => flags.find((f) => f.scope_type === t && f.scope_id === id)?.value;

    if (has('--show') || (!opt('--set') && !has('--clear'))) {
        console.log(`platform: ${flagOf('platform', 'global') ?? '(unset → legacy)'}`);
        for (const c of companies) console.log(`company ${c.slug}: ${flagOf('company', c.id) ?? '(unset)'}`);
        console.log('\nUNIT'.padEnd(34) + 'EXPLICIT'.padEnd(12) + 'EFFECTIVE');
        for (const o of orgs) {
            const explicit = flagOf('organization', o.id);
            const eff = explicit ?? (o.company_id ? flagOf('company', o.company_id) : undefined) ?? flagOf('platform', 'global') ?? 'legacy';
            console.log(`${o.slug} (${o.name})`.slice(0, 33).padEnd(34) + (explicit ?? '-').padEnd(12) + eff);
        }
        await prisma.$disconnect();
        return;
    }

    let scope: { type: string; id: string; label: string };
    if (opt('--unit')) {
        const o = orgs.find((x) => x.slug === opt('--unit') || x.id === opt('--unit'));
        if (!o) { console.error(`No unit "${opt('--unit')}"`); process.exit(2); }
        scope = { type: 'organization', id: o.id, label: `unit ${o.slug}` };
    } else if (opt('--company')) {
        const c = companies.find((x) => x.slug === opt('--company') || x.id === opt('--company'));
        if (!c) { console.error(`No company "${opt('--company')}"`); process.exit(2); }
        scope = { type: 'company', id: c.id, label: `company ${c.slug}` };
    } else if (has('--platform')) {
        scope = { type: 'platform', id: 'global', label: 'platform' };
    } else { console.error('Give --unit, --company or --platform.'); process.exit(2); }

    const clear = has('--clear');
    const value = opt('--set');
    if (!clear && !MODES.includes(value ?? '')) { console.error(`--set must be one of ${MODES.join(', ')}`); process.exit(2); }
    if (!has('--yes')) { console.log(`DRY RUN: would ${clear ? 'clear' : `set to "${value}"`} access_engine for ${scope.label}. Re-run with --yes.`); await prisma.$disconnect(); return; }

    if (clear) await prisma.featureFlag.deleteMany({ where: { scope_type: scope.type, scope_id: scope.id, key: 'access_engine' } });
    else await prisma.featureFlag.upsert({
        where: { scope_type_scope_id_key: { scope_type: scope.type, scope_id: scope.id, key: 'access_engine' } },
        create: { scope_type: scope.type, scope_id: scope.id, key: 'access_engine', value: value!, updated_by: 'scripts/access-engine-mode' },
        update: { value: value!, updated_by: 'scripts/access-engine-mode' },
    });
    console.log(`${clear ? 'Cleared' : `Set ${value} for`} ${scope.label}. Takes effect within ~30 s.`);
    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
