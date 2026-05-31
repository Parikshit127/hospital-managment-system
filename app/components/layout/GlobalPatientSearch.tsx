"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, User, Phone, X, Command } from "lucide-react";
import {
  globalSearchPatients,
  getPatientRouteForRole,
  type GlobalPatientResult,
} from "@/app/actions/global-search-actions";

interface GlobalPatientSearchProps {
  role: string;
  patientBasePath?: string;
}

const ALLOWED_ROLES = new Set([
  "admin",
  "receptionist",
  "doctor",
  "nurse",
  "ipd_manager",
  "finance",
  "opd_manager",
]);

function formatLastVisit(iso: string | null): string {
  if (!iso) return "No visits yet";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function GlobalPatientSearch({ role, patientBasePath }: GlobalPatientSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalPatientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K toggles the search; Escape closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      // focus input on next tick once dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await globalSearchPatients(query);
      if (res.success) {
        setResults(res.data);
        setActiveIdx(0);
      } else {
        setResults([]);
      }
      setLoading(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const navigateTo = useCallback(
    async (patient: GlobalPatientResult) => {
      const href = patientBasePath
        ? `${patientBasePath}/${patient.patient_id}`
        : await getPatientRouteForRole(role, patient.patient_id);
      setOpen(false);
      router.push(href);
    },
    [role, router, patientBasePath],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIdx];
      if (target) navigateTo(target);
    }
  };

  if (!ALLOWED_ROLES.has(role)) return null;

  return (
    <>
      {/* Header trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Search patients (Ctrl/Cmd+K)"
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 text-xs font-medium transition-all"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search patients</span>
        <span className="ml-2 hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10px] font-bold text-gray-400">
          <Command className="h-2.5 w-2.5" />K
        </span>
      </button>
      <button
        onClick={() => setOpen(true)}
        title="Search patients"
        className="sm:hidden p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Overlay + modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search by name, phone, patient ID, or ABHA…"
                className="flex-1 outline-none text-sm font-medium text-gray-800 placeholder:text-gray-400 bg-transparent"
              />
              {loading && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[55vh] overflow-y-auto">
              {!loading && query.trim().length < 2 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium">
                  Type at least 2 characters — name, phone, ID, or ABHA.
                </div>
              )}
              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium">
                  No patients matched &ldquo;{query}&rdquo;.
                </div>
              )}
              {results.map((p, idx) => (
                <button
                  key={p.patient_id}
                  onClick={() => navigateTo(p)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 transition-colors ${
                    idx === activeIdx ? "bg-blue-50/70" : "hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      idx === activeIdx ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {p.full_name}
                      </p>
                      <span className="text-[10px] font-mono font-bold text-gray-400 truncate">
                        {p.patient_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5 font-medium">
                      {p.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                      )}
                      {p.department && <span>· {p.department}</span>}
                      {p.age && (
                        <span>
                          · {p.age}
                          {p.gender ? ` · ${p.gender}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {formatLastVisit(p.last_visit)}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
              <span>↑↓ navigate · ↵ open · Esc close</span>
              <span>{results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
