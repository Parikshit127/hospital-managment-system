/**
 * Permission catalogue helpers — `module.resource.action` keys (ADR-005) over the module registry.
 * Edge-safe: pure functions, no Node/Prisma imports.
 */
import { MODULES } from '../modules/registry';
import type { DataScope, ModuleDef, PermissionDef } from '../modules/types';

/** Narrowest to widest. A wider scope always wins when the same permission is granted twice. */
export const SCOPE_ORDER: readonly DataScope[] = ['OWN', 'TEAM', 'DEPARTMENT', 'UNIT', 'COMPANY'];

export function widerScope(a: DataScope | null | undefined, b: DataScope | null | undefined): DataScope | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return SCOPE_ORDER.indexOf(a) >= SCOPE_ORDER.indexOf(b) ? a : b;
}

export function isDataScope(v: unknown): v is DataScope {
    return typeof v === 'string' && (SCOPE_ORDER as readonly string[]).includes(v);
}

const MODULE_BY_KEY = new Map<string, ModuleDef>(MODULES.map((m) => [m.key, m]));

const PERMISSION_BY_KEY = new Map<string, { def: PermissionDef; module: ModuleDef }>();
for (const m of MODULES) for (const p of m.permissions ?? []) PERMISSION_BY_KEY.set(p.key, { def: p, module: m });

const MODULE_BY_LEGACY_KEY = new Map<string, ModuleDef>();
for (const m of MODULES) for (const k of m.legacyPermissions) MODULE_BY_LEGACY_KEY.set(k, m);

/** Every `module.resource.action` key declared by the registry. */
export const ALL_PERMISSION_KEYS: readonly string[] = [...PERMISSION_BY_KEY.keys()];

export function getModule(key: string): ModuleDef | undefined {
    return MODULE_BY_KEY.get(key);
}

export function getPermissionDef(key: string): PermissionDef | undefined {
    return PERMISSION_BY_KEY.get(key)?.def;
}

/** The module a permission belongs to — new-style or legacy key. */
export function moduleOfPermission(key: string): ModuleDef | undefined {
    return PERMISSION_BY_KEY.get(key)?.module ?? MODULE_BY_LEGACY_KEY.get(key) ?? MODULE_BY_KEY.get(key.split('.')[0]);
}

/** The legacy `module.action` key whose holders hold this permission, if the registry ties one. */
export function legacyKeyOf(key: string): string | undefined {
    return PERMISSION_BY_KEY.get(key)?.def.legacyKey;
}

/**
 * Keys a role template must hold for this permission to be satisfied: the permission's own key,
 * or — when it is tied to a legacy key — that legacy key.
 */
export function storageKeysFor(key: string): string[] {
    const legacy = legacyKeyOf(key);
    return legacy ? [key, legacy] : [key];
}

/** All permission definitions that have NO legacy key (their grants must be seeded as rows). */
export function seededPermissions(): { def: PermissionDef; module: ModuleDef }[] {
    return [...PERMISSION_BY_KEY.values()].filter((p) => !p.def.legacyKey);
}

/** Only `module.resource.action` shaped strings are catalogue keys. */
export function isCatalogueKey(key: string): boolean {
    return PERMISSION_BY_KEY.has(key);
}
