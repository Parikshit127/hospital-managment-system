'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration: number;
    exiting?: boolean;
}

interface ToastContextType {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            const timer = timersRef.current.get(id);
            if (timer) {
                clearTimeout(timer);
                timersRef.current.delete(id);
            }
        }, 280);
    }, []);

    const addToast = useCallback((message: string, type: ToastType, duration = 4000) => {
        const id = ++toastId;
        setToasts(prev => {
            const next = [...prev, { id, message, type, duration }];
            if (next.length > 3) {
                const removed = next.shift();
                if (removed) {
                    const timer = timersRef.current.get(removed.id);
                    if (timer) { clearTimeout(timer); timersRef.current.delete(removed.id); }
                }
            }
            return next;
        });
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
    }, [removeToast]);

    const toast: ToastContextType = {
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
    };

    const iconMap = {
        success: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />,
        error: <XCircle className="h-4.5 w-4.5 text-rose-500 shrink-0" />,
        info: <Info className="h-4.5 w-4.5 text-sky-500 shrink-0" />,
        warning: <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />,
    };

    const bgMap = {
        success: 'bg-white border-emerald-200/60',
        error: 'bg-white border-rose-200/60',
        info: 'bg-white border-sky-200/60',
        warning: 'bg-white border-amber-200/60',
    };

    const accentMap = {
        success: 'bg-emerald-500',
        error: 'bg-rose-500',
        info: 'bg-sky-500',
        warning: 'bg-amber-500',
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto relative flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl border shadow-lg text-sm font-medium overflow-hidden ${bgMap[t.type]}`}
                        style={{
                            animation: t.exiting
                                ? 'toastOut 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards'
                                : 'toastIn 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                            boxShadow: 'var(--shadow-lg)',
                        }}
                    >
                        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentMap[t.type]}`} />
                        <span className="mt-0.5">{iconMap[t.type]}</span>
                        <span className="flex-1 text-gray-800 text-[13px] leading-snug">{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                            <X className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                        {/* Progress bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-100">
                            <div
                                className={`h-full ${accentMap[t.type]} opacity-30`}
                                style={{ animation: `toastProgress ${t.duration}ms linear forwards` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextType {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        return {
            success: () => {},
            error: () => {},
            info: () => {},
            warning: () => {},
        };
    }
    return ctx;
}
