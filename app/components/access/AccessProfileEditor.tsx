'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Lock, RotateCcw } from 'lucide-react';
import type { getAccessEditorSetupAction } from '@/app/actions/access-profile-actions';
import { IMPLICIT_APPS, inferLevel, presetValue, type AccessProfileValue, type Level } from '@/app/lib/access/presets';
import * as ops from '@/app/lib/access/editor-ops';
import type { EditorCtx } from '@/app/lib/access/editor-ops';
import { LEGACY_MY_WORKSPACE, buildNav } from '@/app/lib/access/claims';

export type EditorSetup = Extract<Awaited<ReturnType<typeof getAccessEditorSetupAction>>, { success: true }>['data'];
type ModuleMeta = EditorSetup['modules'][number];

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400';

const ACTION_LABEL: Record<string, string> = {
    view: 'View', create: 'Create', edit: 'Edit', approve: 'Approve', export: 'Export', execute: 'Operate', cancel: 'Cancel', delete: 'Delete', assign: 'Assign',
};
const LEVEL_LABEL: Record<Level, string> = { none: 'Pages only', view: 'View only', standard: 'Standard', full: 'Full', custom: 'Custom' };
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/**
 * The module-by-module access editor (ACCESS_PROFILES_PLAN.md). Controlled: `value` in, `onChange` out. Nothing is
 * saved here - the page decides when. The server re-checks every rule, so the locks below are guidance, not security.
 *
 *   baseline  the value as loaded; for a non-admin it pins the Finance / Insurance / admin-only slice, which only an
 *             Administrator may change.
 */
export function AccessProfileEditor({ setup, value, baseline, onChange, readOnly = false, personName }: {
    setup: EditorSetup;
    value: AccessProfileValue;
    baseline: AccessProfileValue;
    onChange: (v: AccessProfileValue) => void;
    readOnly?: boolean;
    personName?: string;
}) {
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const isAdmin = setup.actor.isAdmin;
    const restrictedBase = !isAdmin && setup.presets.some((p) => p.slug === baseline.preset && p.restrictedForHr);
    const selected = useMemo(() => new Set(Object.keys(value.permissions)), [value.permissions]);
    // HR cannot hand out the Admin/Finance base role, and cannot move someone who already has one off it.
    const presets = setup.presets.filter((p) => p.slug !== 'admin' && (isAdmin || (!p.restrictedForHr && !restrictedBase) || p.slug === baseline.preset));
    const lockedFor = (m: ModuleMeta) => !isAdmin && m.restrictedForHr;

    const ctx: EditorCtx = { modules: setup.modules, isAdmin, baseline };
    const ownKeys = (m: ModuleMeta) => m.permissions.map((p) => p.key);
    const toggleApp = (m: ModuleMeta, on: boolean) => { if (!readOnly) onChange(ops.toggleApp(ctx, value, m.key, on)); };
    const setLevel = (m: ModuleMeta, level: Level) => { if (!readOnly) onChange(ops.setLevel(ctx, value, m.key, level)); };
    const togglePerm = (m: ModuleMeta, key: string, on: boolean) => { if (!readOnly) onChange(ops.togglePerm(ctx, value, key, on)); };
    const changePreset = (slug: string) => { if (!readOnly) onChange(ops.changePreset(ctx, slug)); };

    const chosen = !!value.preset;
    const modulesOn = new Set(value.modules);
    const defaults = chosen ? presetValue(value.preset) : { preset: '', modules: [], permissions: {} };
    const added = value.modules.filter((k) => !defaults.modules.includes(k));
    const removed = defaults.modules.filter((k) => !modulesOn.has(k));
    const nameOf = (k: string) => setup.modules.find((m) => m.key === k)?.name ?? k;

    const nav = useMemo(() => {
        if (!value.preset) return [];
        const mods = [...new Set([...value.modules, ...IMPLICIT_APPS])];
        return [...buildNav(value.preset, { mods }), LEGACY_MY_WORKSPACE];
    }, [value.modules, value.preset]);

    return (
        <div className="space-y-5">
            <div className="grid sm:grid-cols-[minmax(0,320px)_1fr] gap-4 items-end">
                <label className="block">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Base role</span>
                    <select className={inputCls} value={value.preset} disabled={readOnly} onChange={(e) => changePreset(e.target.value)}>
                        {!chosen && <option value="">— choose a base role —</option>}
                        {presets.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                    </select>
                </label>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <button type="button" disabled={readOnly || !chosen} onClick={() => changePreset(value.preset)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Reset to role defaults
                    </button>
                    <span>The base role sets the starting modules and the landing page. Changing it resets the modules below.</span>
                </div>
            </div>

            {!chosen && <p className="text-sm text-gray-500">Pick a base role first — it fills in the modules that job normally needs. You can then add or remove modules.</p>}

            {chosen && <><div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-800">Modules {personName ? `for ${personName}` : ''}</h3>
                    <span className="text-xs text-gray-400">{value.modules.length} selected · My Workspace is always included</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                    {setup.modules.map((m) => {
                        const on = modulesOn.has(m.key);
                        const locked = lockedFor(m);
                        const level = on || ownKeys(m).some((k) => selected.has(k)) ? inferLevel(m.key, selected) : 'none';
                        const expanded = !!open[m.key];
                        const crossOnly = !on && m.permissions.some((p) => p.crossModule && selected.has(p.key));
                        const byResource = new Map<string, ModuleMeta['permissions']>();
                        for (const p of m.permissions) byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p]);
                        return (
                            <div key={m.key} className={`rounded-2xl border p-3.5 transition ${on ? 'border-orange-300 bg-orange-50/40' : 'border-gray-200 bg-white'} ${locked ? 'opacity-80' : ''}`}>
                                <div className="flex items-start gap-3">
                                    <input type="checkbox" className="mt-1 h-4 w-4 accent-orange-500" checked={on} disabled={readOnly || locked}
                                        onChange={(e) => toggleApp(m, e.target.checked)} aria-label={`${m.name} module`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-gray-900">{m.name}</span>
                                            {locked && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5"><Lock className="h-3 w-3" /> Admin only</span>}
                                            {!m.detailed && on && <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">Opens all pages of the app</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{m.blurb}</p>
                                        {crossOnly && <p className="text-[11px] text-gray-400 mt-1">App off · keeps shared lookups other apps use</p>}
                                    </div>
                                    {m.detailed && (on || crossOnly) && (
                                        <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-semibold text-gray-700 disabled:bg-gray-50"
                                            value={level} disabled={readOnly || locked}
                                            onChange={(e) => setLevel(m, e.target.value as Level)} aria-label={`${m.name} level`}>
                                            {(['none', 'view', 'standard', 'full'] as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                                            {level === 'custom' && <option value="custom">Custom</option>}
                                        </select>
                                    )}
                                </div>
                                {m.detailed && (on || crossOnly) && (
                                    <div className="mt-2 ml-7">
                                        <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800"
                                            onClick={() => setOpen((o) => ({ ...o, [m.key]: !expanded }))}>
                                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            Fine-tune what they can do ({m.permissions.filter((p) => selected.has(p.key)).length} of {m.permissions.length})
                                        </button>
                                        {expanded && (
                                            <div className="mt-2 space-y-1.5">
                                                {[...byResource.entries()].map(([resource, perms]) => (
                                                    <div key={resource} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                        <span className="w-24 shrink-0 text-xs font-semibold text-gray-600">{title(resource)}</span>
                                                        {perms.map((p) => {
                                                            const disabled = readOnly || locked || (p.adminOnly && !isAdmin) || (!on && !p.crossModule);
                                                            return (
                                                                <label key={p.key} title={p.description} className={`inline-flex items-center gap-1.5 text-xs ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
                                                                    <input type="checkbox" className="h-3.5 w-3.5 accent-orange-500" checked={selected.has(p.key)} disabled={disabled}
                                                                        onChange={(e) => togglePerm(m, p.key, e.target.checked)} />
                                                                    {ACTION_LABEL[p.action] ?? title(p.action)}
                                                                    {p.adminOnly && <Lock className="h-3 w-3 text-gray-400" />}
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {!isAdmin && <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><Lock className="h-3 w-3" /> Finance, Insurance and “assign access” rights can only be changed by an administrator.</p>}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2"><Eye className="h-3 w-3" /> What {personName ?? 'they'} will see in the sidebar</div>
                    <div className="max-h-64 overflow-auto text-sm">
                        {nav.map((sec) => (
                            <div key={sec.title} className="mb-2">
                                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{sec.title}</div>
                                {sec.items.map((i) => <div key={i.href} className="text-gray-700 pl-2 py-0.5">{i.label}</div>)}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Compared with the {setup.presets.find((p) => p.slug === value.preset)?.label ?? value.preset} defaults</div>
                    {added.length === 0 && removed.length === 0 && Object.keys(value.permissions).join() === Object.keys(defaults.permissions).join()
                        ? <p className="text-gray-500">Exactly the defaults.</p>
                        : (
                            <div className="space-y-1">
                                {added.map((k) => <div key={k} className="text-emerald-700">+ {nameOf(k)}</div>)}
                                {removed.map((k) => <div key={k} className="text-red-600">− {nameOf(k)}</div>)}
                                {added.length === 0 && removed.length === 0 && <p className="text-gray-500">Same modules; fine-tuned permissions inside them.</p>}
                            </div>
                        )}
                    <p className="text-[11px] text-gray-400 mt-3">
                        Modules marked “Opens all pages of the app” give access to every page of that app; detailed permissions inside them are being added module by module.
                    </p>
                </div>
            </div></>}
        </div>
    );
}
