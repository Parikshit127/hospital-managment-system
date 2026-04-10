'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Search, X, Star, Loader2 } from 'lucide-react';
import { searchICD10Codes } from '@/app/actions/emr-actions';

export type ICD10Selection = {
    code: string;
    name: string;
    type: 'primary' | 'secondary' | 'rule_out';
    status: 'confirmed' | 'provisional' | 'rule_out';
};

interface ICD10SearchProps {
    selected: ICD10Selection[];
    onChange: (selected: ICD10Selection[]) => void;
    disabled?: boolean;
}

const COMMON_CODES = [
    { code: 'J06.9', name: 'Acute upper respiratory infection, unspecified' },
    { code: 'K21.0', name: 'Gastro-oesophageal reflux disease with oesophagitis' },
    { code: 'I10', name: 'Essential (primary) hypertension' },
    { code: 'E11.9', name: 'Type 2 diabetes mellitus without complications' },
    { code: 'J18.9', name: 'Pneumonia, unspecified organism' },
    { code: 'M54.5', name: 'Low back pain' },
    { code: 'K59.00', name: 'Constipation, unspecified' },
    { code: 'R51', name: 'Headache' },
    { code: 'A09', name: 'Infectious gastroenteritis and colitis, unspecified' },
    { code: 'J00', name: 'Acute nasopharyngitis (common cold)' },
    { code: 'B34.9', name: 'Viral infection, unspecified' },
    { code: 'N39.0', name: 'Urinary tract infection, site not specified' },
    { code: 'L50.9', name: 'Urticaria, unspecified' },
    { code: 'R05', name: 'Cough' },
    { code: 'R50.9', name: 'Fever, unspecified' },
    { code: 'K30', name: 'Functional dyspepsia' },
];

export function ICD10Search({ selected, onChange, disabled }: ICD10SearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ code: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback((q: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (q.length < 2) { setResults([]); setShowDropdown(false); return; }
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            const res = await searchICD10Codes(q);
            if (res.success) setResults(res.data);
            setLoading(false);
            setShowDropdown(true);
        }, 400);
    }, []);

    function addCode(code: string, name: string) {
        if (selected.some(s => s.code === code)) return;
        const isFirst = selected.length === 0 || !selected.some(s => s.type === 'primary');
        onChange([...selected, {
            code, name,
            type: isFirst ? 'primary' : 'secondary',
            status: 'confirmed',
        }]);
        setQuery('');
        setResults([]);
        setShowDropdown(false);
    }

    function removeCode(code: string) {
        onChange(selected.filter(s => s.code !== code));
    }

    function toggleType(code: string) {
        onChange(selected.map(s => s.code === code
            ? { ...s, type: s.type === 'primary' ? 'secondary' : s.type === 'secondary' ? 'rule_out' : 'primary' }
            : s
        ));
    }

    const TYPE_COLOR: Record<string, string> = {
        primary: 'bg-teal-100 text-teal-700 border-teal-200',
        secondary: 'bg-blue-100 text-blue-700 border-blue-200',
        rule_out: 'bg-amber-100 text-amber-700 border-amber-200',
    };

    return (
        <div className="space-y-3">
            {/* Selected diagnoses */}
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selected.map(s => (
                        <div key={s.code} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold ${TYPE_COLOR[s.type]}`}>
                            <span className="font-mono">{s.code}</span>
                            <span className="max-w-[180px] truncate">{s.name}</span>
                            <button
                                type="button"
                                onClick={() => toggleType(s.code)}
                                className="opacity-60 hover:opacity-100 text-[9px] uppercase font-black px-1 py-0.5 rounded bg-white/50"
                                title="Click to cycle type"
                            >
                                {s.type}
                            </button>
                            {!disabled && (
                                <button type="button" onClick={() => removeCode(s.code)} className="opacity-60 hover:opacity-100 ml-0.5">
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!disabled && (
                <div className="relative">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500 animate-spin" />}
                        <input
                            type="text"
                            value={query}
                            onChange={e => { setQuery(e.target.value); search(e.target.value); }}
                            onFocus={() => query.length < 2 && setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                            placeholder="Search ICD-10 codes or diagnoses..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-medium outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10"
                        />
                    </div>

                    {showDropdown && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                            {query.length < 2 ? (
                                <>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">Common Codes</p>
                                    {COMMON_CODES.filter(c => !selected.some(s => s.code === c.code)).map(c => (
                                        <button
                                            key={c.code}
                                            type="button"
                                            onMouseDown={() => addCode(c.code, c.name)}
                                            className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors flex items-center gap-2"
                                        >
                                            <Star className="h-3 w-3 text-amber-400 flex-shrink-0" />
                                            <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{c.code}</span>
                                            <span className="text-xs text-gray-700 truncate">{c.name}</span>
                                        </button>
                                    ))}
                                </>
                            ) : results.length === 0 && !loading ? (
                                <p className="px-3 py-4 text-xs text-gray-400 text-center">No results found</p>
                            ) : (
                                results.filter(r => !selected.some(s => s.code === r.code)).map(r => (
                                    <button
                                        key={r.code}
                                        type="button"
                                        onMouseDown={() => addCode(r.code, r.name)}
                                        className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors flex items-center gap-2"
                                    >
                                        <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{r.code}</span>
                                        <span className="text-xs text-gray-700 truncate">{r.name}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {selected.length === 0 && (
                <p className="text-xs text-gray-400 italic">No diagnoses added. Search above or pick a common code.</p>
            )}
        </div>
    );
}
