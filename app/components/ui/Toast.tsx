'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast: ToastContextType = {
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        info: (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning'),
    };

    const iconMap = {
        success: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
        error: <XCircle className="h-4 w-4 text-rose-500 shrink-0" />,
        info: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
    };

    const bgMap = {
        success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        error: 'bg-rose-50 border-rose-200 text-rose-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium animate-in ${bgMap[t.type]}`}
                        style={{ animation: 'fadeIn 0.2s ease-out' }}
                    >
                        {iconMap[t.type]}
                        <span className="flex-1">{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="p-0.5 rounded hover:bg-black/5 transition-colors shrink-0">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextType {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Return a no-op fallback so pages work even without provider
        return {
            success: () => {},
            error: () => {},
            info: () => {},
            warning: () => {},
        };
    }
    return ctx;
}
