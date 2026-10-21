'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

/** Small shared kit for the /admin/access/* pages so they match the rest of the admin console. */

export const inputCls =
    'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400';

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white border border-gray-200 rounded-2xl shadow-sm ${className}`}>
            {(title || actions) && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-bold text-gray-800">{title}</h2>
                    <div className="flex items-center gap-2">{actions}</div>
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}

export function Btn({ children, onClick, href, kind = 'primary', disabled, busy, type = 'button', small }: {
    children: React.ReactNode; onClick?: () => void; href?: string; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; busy?: boolean; type?: 'button' | 'submit'; small?: boolean;
}) {
    const base = `inline-flex items-center gap-1.5 rounded-xl font-bold transition disabled:opacity-50 ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`;
    const tone = kind === 'primary' ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-md'
        : kind === 'danger' ? 'text-white bg-red-600 hover:bg-red-700' : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50';
    if (href) return <Link href={href} className={`${base} ${tone}`}>{children}</Link>;
    return (
        <button type={type} onClick={onClick} disabled={disabled || busy} className={`${base} ${tone}`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
        </button>
    );
}

export function Chip({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'orange' | 'red' | 'blue' | 'violet' }) {
    const t = { gray: 'bg-gray-100 text-gray-700', green: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700' }[tone];
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'info'; children: React.ReactNode }) {
    const t = { error: 'bg-red-50 border-red-200 text-red-800', ok: 'bg-emerald-50 border-emerald-200 text-emerald-800', info: 'bg-blue-50 border-blue-200 text-blue-800' }[kind];
    return <div className={`border rounded-xl px-4 py-2.5 text-sm ${t}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">{label}</span>
            {children}
            {hint && <span className="text-[11px] text-gray-400 mt-1 block">{hint}</span>}
        </label>
    );
}

export function AccessTabs({ active }: { active: 'users' | 'roles' | 'log' | 'import' }) {
    const tabs = [['users', 'Users', '/admin/access/users'], ['roles', 'Roles', '/admin/access/roles'], ['import', 'Bulk import', '/admin/access/import'], ['log', 'Change log', '/admin/access/log']] as const;
    return (
        <div className="flex gap-1 border-b border-gray-200">
            {tabs.map(([k, label, href]) => (
                <Link key={k} href={href} className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${active === k ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</Link>
            ))}
        </div>
    );
}

export const fmt = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** "hr.leave.approve" → "HR · leave · approve" for display */
export const prettyKey = (k: string) => k.split('.').join(' · ');
