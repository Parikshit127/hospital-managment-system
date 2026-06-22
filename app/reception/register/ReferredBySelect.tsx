'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, Plus, Loader2 } from 'lucide-react';
import { getActiveReferrers, quickAddReferrer } from '@/app/actions/referral-actions';
import { REFERRER_CATEGORIES } from '@/app/lib/referral-constants';

type Referrer = { id: string; name: string; category: string; phone?: string | null };

const CATEGORY_LABEL: Record<string, string> = {
    staff: 'Staff',
    affiliate: 'Affiliate',
    interpreter: 'Interpreter',
    rmp: 'RMP',
    others: 'Others',
};

/**
 * "Referred By" picker for the registration form. Defaults to Self (no referrer).
 * Writes the chosen referrer id into a hidden <input name="referrer_id">.
 * Internal-only — never shown on bills or the patient portal.
 */
export default function ReferredBySelect({
    labelClass,
    selectClass,
}: {
    labelClass?: string;
    selectClass?: string;
}) {
    const [referrers, setReferrers] = useState<Referrer[]>([]);
    const [selected, setSelected] = useState<string>(''); // '' = Self
    const [loading, setLoading] = useState(true);

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState('rmp');
    const [newPhone, setNewPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await getActiveReferrers();
        if (res.success) setReferrers(res.data as Referrer[]);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const grouped = REFERRER_CATEGORIES.map((cat) => ({
        cat,
        items: referrers.filter((r) => r.category === cat),
    })).filter((g) => g.items.length > 0);

    const handleQuickAdd = async () => {
        if (!newName.trim()) {
            setAddError('Name is required');
            return;
        }
        setSaving(true);
        setAddError(null);
        const res = await quickAddReferrer({ name: newName.trim(), category: newCategory, phone: newPhone.trim() });
        setSaving(false);
        if (!res.success || !res.data) {
            setAddError(res.error || 'Failed to add referrer');
            return;
        }
        await load();
        setSelected(res.data.id);
        setShowAdd(false);
        setNewName('');
        setNewPhone('');
        setNewCategory('rmp');
    };

    return (
        <div className="space-y-1.5">
            <label className={labelClass}>Referred By</label>
            <input type="hidden" name="referrer_id" value={selected} />

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        disabled={loading}
                        className={`${selectClass || ''} pl-11`}
                    >
                        <option value="">Self / Walk-in</option>
                        {grouped.map((g) => (
                            <optgroup key={g.cat} label={CATEGORY_LABEL[g.cat] || g.cat}>
                                {g.items.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                        {r.phone ? ` — ${r.phone}` : ''}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdd((s) => !s)}
                    className="inline-flex items-center gap-1 px-3 rounded-xl border border-teal-300 text-teal-600 text-xs font-bold hover:bg-teal-50 whitespace-nowrap"
                >
                    <Plus className="h-4 w-4" /> New
                </button>
            </div>

            {showAdd && (
                <div className="mt-2 p-3 border border-gray-200 rounded-xl bg-gray-50 space-y-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Add new referrer</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Name *"
                            className={selectClass || 'border rounded-lg px-3 py-2 text-sm'}
                        />
                        <select
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            className={selectClass || 'border rounded-lg px-3 py-2 text-sm'}
                        >
                            {REFERRER_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {CATEGORY_LABEL[c] || c}
                                </option>
                            ))}
                        </select>
                        <input
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="Phone"
                            className={selectClass || 'border rounded-lg px-3 py-2 text-sm'}
                        />
                    </div>
                    {addError && <p className="text-xs text-red-500 font-medium">{addError}</p>}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleQuickAdd}
                            disabled={saving}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-bold hover:bg-teal-600 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            Save referrer
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAdd(false)}
                            className="px-3 py-1.5 rounded-lg text-gray-500 text-xs font-bold hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
