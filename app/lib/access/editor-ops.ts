/**
 * The state transitions behind the access editor (app/components/access/AccessProfileEditor.tsx), kept pure so the
 * rules - above all "HR cannot touch the Finance / Insurance / admin-only slice" - are unit-tested rather than
 * trusted to React code. The server re-checks everything (`checkProfileChange`); these only keep the UI honest.
 */
import {
    CROSS_MODULE_PERMISSIONS, HR_RESTRICTED_MODULES, levelKeys, presetValue, type AccessProfileValue, type Level, type ModuleMeta,
} from './presets';

export interface EditorCtx {
    modules: readonly ModuleMeta[];
    isAdmin: boolean;
    /** the value as loaded: pins the restricted slice for a non-admin */
    baseline: AccessProfileValue;
}

const ownKeys = (m: ModuleMeta) => m.permissions.map((p) => p.key);
const isRestrictedKey = (ctx: EditorCtx, key: string) => {
    const m = ctx.modules.find((x) => x.permissions.some((p) => p.key === key));
    return !!m && (m.restrictedForHr || m.permissions.some((p) => p.key === key && p.adminOnly));
};

/** For a non-admin, put the baseline's restricted part back whatever else changed. */
export function pin(ctx: EditorCtx, v: AccessProfileValue): AccessProfileValue {
    if (ctx.isAdmin) return v;
    const modules = new Set(v.modules.filter((k) => !HR_RESTRICTED_MODULES.includes(k)));
    for (const k of ctx.baseline.modules) if (HR_RESTRICTED_MODULES.includes(k)) modules.add(k);
    const permissions: AccessProfileValue['permissions'] = {};
    for (const [k, s] of Object.entries(v.permissions)) if (!isRestrictedKey(ctx, k)) permissions[k] = s;
    for (const [k, s] of Object.entries(ctx.baseline.permissions)) if (isRestrictedKey(ctx, k)) permissions[k] = s;
    return { ...v, modules: [...modules].sort(), permissions };
}

function withPerms(v: AccessProfileValue, remove: string[], add: string[]): AccessProfileValue['permissions'] {
    const permissions = { ...v.permissions };
    for (const k of remove) delete permissions[k];
    for (const k of add) permissions[k] = 'UNIT';
    return permissions;
}

const find = (ctx: EditorCtx, key: string) => ctx.modules.find((m) => m.key === key);
const locked = (ctx: EditorCtx, m: ModuleMeta) => !ctx.isAdmin && m.restrictedForHr;

/** Switch an app on/off. Turning a detailed app on starts it at "Standard"; off removes its permissions except shared lookups. */
export function toggleApp(ctx: EditorCtx, v: AccessProfileValue, moduleKey: string, on: boolean): AccessProfileValue {
    const m = find(ctx, moduleKey);
    if (!m || locked(ctx, m)) return v;
    if (on) {
        const hadAny = ownKeys(m).some((k) => k in v.permissions);
        return pin(ctx, {
            ...v, modules: [...new Set([...v.modules, m.key])],
            permissions: m.detailed && !hadAny ? withPerms(v, [], levelKeys(m.key, 'standard')) : v.permissions,
        });
    }
    const drop = ownKeys(m).filter((k) => !CROSS_MODULE_PERMISSIONS.includes(k));
    return pin(ctx, { ...v, modules: v.modules.filter((k) => k !== m.key), permissions: withPerms(v, drop, []) });
}

export function setLevel(ctx: EditorCtx, v: AccessProfileValue, moduleKey: string, level: Level): AccessProfileValue {
    const m = find(ctx, moduleKey);
    if (!m || locked(ctx, m) || level === 'custom') return v;
    const adminOnlyKept = m.permissions.filter((p) => p.adminOnly && p.key in v.permissions).map((p) => p.key);
    const next = level === 'none' ? [] : levelKeys(m.key, level);
    return pin(ctx, { ...v, permissions: withPerms(v, ownKeys(m), [...next, ...(ctx.isAdmin ? adminOnlyKept : [])]) });
}

export function togglePerm(ctx: EditorCtx, v: AccessProfileValue, key: string, on: boolean): AccessProfileValue {
    const m = ctx.modules.find((x) => x.permissions.some((p) => p.key === key));
    if (!m || locked(ctx, m)) return v;
    const def = m.permissions.find((p) => p.key === key)!;
    if (def.adminOnly && !ctx.isAdmin) return v;
    if (on && !v.modules.includes(m.key) && !def.crossModule) return v; // a permission needs its app (shared lookups excepted)
    return pin(ctx, { ...v, permissions: on ? withPerms(v, [], [key]) : withPerms(v, [key], []) });
}

/** Pick (or reset to) a base role: its modules and permissions replace the current ones. */
export function changePreset(ctx: EditorCtx, slug: string): AccessProfileValue {
    return pin(ctx, presetValue(slug));
}
