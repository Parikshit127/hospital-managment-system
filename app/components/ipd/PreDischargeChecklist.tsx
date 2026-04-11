'use client';

import { useState } from 'react';
import { CheckCircle, Circle, ClipboardList } from 'lucide-react';
import { updateDischargeChecklistItem } from '@/app/actions/ipd-nursing-actions';

interface ChecklistItem {
    id: string;
    label: string;
    done: boolean;
}

interface PreDischargeChecklistProps {
    admissionId: string;
    items: ChecklistItem[];
    onUpdate?: () => void;
}

export function PreDischargeChecklist({ admissionId, items, onUpdate }: PreDischargeChecklistProps) {
    const [localItems, setLocalItems] = useState<ChecklistItem[]>(items);
    const [saving, setSaving] = useState<string | null>(null);

    const doneCount = localItems.filter(i => i.done).length;
    const allDone = doneCount === localItems.length && localItems.length > 0;

    async function toggle(item: ChecklistItem) {
        setSaving(item.id);
        const newDone = !item.done;
        setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, done: newDone } : i));
        await updateDischargeChecklistItem(admissionId, item.id, newDone);
        setSaving(null);
        onUpdate?.();
    }

    if (localItems.length === 0) {
        return (
            <div className="text-xs text-gray-400 italic flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Mark patient fit for discharge to activate checklist
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Pre-Discharge Checklist</p>
                <span className={`text-xs font-black ${allDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {doneCount}/{localItems.length} done
                </span>
            </div>
            {allDone && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    All items cleared — patient ready for discharge
                </div>
            )}
            <div className="space-y-1.5">
                {localItems.map(item => (
                    <button key={item.id} onClick={() => toggle(item)} disabled={saving === item.id}
                        className="w-full flex items-center gap-2 text-left text-xs hover:bg-gray-50 rounded-lg p-1.5 transition-colors">
                        {item.done
                            ? <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                            : <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />}
                        <span className={item.done ? 'line-through text-gray-400' : 'text-gray-700'}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
