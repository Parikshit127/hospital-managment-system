'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Loader2, Clock, Sparkles } from 'lucide-react';
import { searchServiceCatalog } from '@/app/actions/ipd-master-actions';

export type CatalogService = {
  id: string;
  service_name: string;
  service_code: string;
  default_rate: number;
  tax_rate: number;
  service_category: string;
  hsn_sac_code: string;
  source: 'ipd' | 'catalog' | 'lab' | 'radiology';
};

type Props = {
  onPick: (service: CatalogService) => void;
  onAddMisc?: () => void;
  excludeIds?: string[];
  placeholder?: string;
};

const RECENTS_KEY = 'service_picker_recents_v1';
const RECENTS_MAX = 5;

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecents(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, RECENTS_MAX)));
  } catch { /* quota / privacy mode */ }
}

export function ServicePicker({ onPick, onAddMisc, excludeIds = [], placeholder = 'Search services, tests, procedures…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogService[]>([]);
  const [recents, setRecents] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  // Hydrate recents (localStorage IDs → fresh records from catalog)
  useEffect(() => {
    const ids = readRecents();
    if (ids.length === 0) return;
    let cancelled = false;
    searchServiceCatalog('', RECENTS_MAX, ids).then((res) => {
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        // Preserve the localStorage order (most-recent first)
        const byId = new Map((res.data as CatalogService[]).map((s) => [s.id, s] as const));
        setRecents(ids.map((id) => byId.get(id)).filter((s): s is CatalogService => !!s));
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      // Empty query — preload the first page so groups render immediately
      setLoading(true);
      searchServiceCatalog('', 60).then((res) => {
        setLoading(false);
        if (res.success) setResults(res.data as CatalogService[]);
      });
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchServiceCatalog(query.trim(), 80).then((res) => {
        setLoading(false);
        if (res.success) setResults(res.data as CatalogService[]);
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePick = useCallback((s: CatalogService) => {
    onPick(s);
    // Record into recents (most-recent-first, dedupe)
    const next = [s.id, ...readRecents().filter((id) => id !== s.id)].slice(0, RECENTS_MAX);
    writeRecents(next);
  }, [onPick]);

  // Group by category for the dropdown
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogService[]>();
    for (const s of results) {
      if (excluded.has(s.id)) continue;
      if (!map.has(s.service_category)) map.set(s.service_category, []);
      map.get(s.service_category)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, excluded]);

  return (
    <div className="space-y-3">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 outline-none"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Misc charge escape hatch */}
      {onAddMisc && (
        <button
          type="button"
          onClick={onAddMisc}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-600 transition-all"
        >
          <Plus className="h-3.5 w-3.5" /> Add Misc Charge (one-off line)
        </button>
      )}

      {/* Recents (only when query is empty and recents exist) */}
      {query.trim().length === 0 && recents.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <Clock className="h-3 w-3" /> Recently used
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {recents.filter((r) => !excluded.has(r.id)).map((s) => (
              <ServiceRow key={`recent-${s.id}`} service={s} onPick={handlePick} compact />
            ))}
          </div>
        </div>
      )}

      {/* Grouped results */}
      <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
        {grouped.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-6">No services match that query.</p>
        )}
        {grouped.map(([category, list]) => (
          <div key={category} className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 bg-white py-1">
              <Sparkles className="h-3 w-3" /> {category}
              <span className="text-gray-300 font-bold">· {list.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {list.map((s) => (
                <ServiceRow key={s.id} service={s} onPick={handlePick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceRow({ service, onPick, compact = false }: { service: CatalogService; onPick: (s: CatalogService) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick(service)}
      className={`group text-left w-full ${compact ? 'p-2' : 'p-2.5'} bg-white border border-gray-200 rounded-lg hover:border-orange-300 hover:bg-orange-50/40 transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-900 truncate">{service.service_name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
            {service.service_code ? `${service.service_code} · ` : ''}
            HSN/SAC {service.hsn_sac_code} · {service.tax_rate}% GST
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-black text-orange-600">₹{service.default_rate.toLocaleString('en-IN')}</p>
          <Plus className="h-3.5 w-3.5 text-gray-300 group-hover:text-orange-500 ml-auto mt-0.5" />
        </div>
      </div>
    </button>
  );
}

export default ServicePicker;
