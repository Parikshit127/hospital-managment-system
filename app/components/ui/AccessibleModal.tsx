'use client';

import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface AccessibleModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

/**
 * WCAG 2.1 AA compliant modal dialog.
 * - role="dialog", aria-modal="true"
 * - Focus trap (Tab/Shift+Tab cycle within modal)
 * - Escape to close
 * - Focus returns to trigger element on close
 * - Prevents background scroll
 */
export function AccessibleModal({ open, onClose, title, children, maxWidth = 'max-w-md' }: AccessibleModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
            return;
        }

        // Focus trap
        if (e.key === 'Tab' && dialogRef.current) {
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }, [onClose]);

    useEffect(() => {
        if (open) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                const first = dialogRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                first?.focus();
            });
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
            if (!open && previousFocusRef.current) {
                previousFocusRef.current.focus();
            }
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="presentation"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`bg-white rounded-2xl ${maxWidth} w-full p-6 relative focus:outline-none`}
                style={{ animation: 'scaleIn 0.2s cubic-bezier(0.22, 1, 0.36, 1)', boxShadow: 'var(--shadow-xl)' }}
                tabIndex={-1}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-lg p-1 hover:bg-gray-100"
                    aria-label="Close dialog"
                >
                    <X className="h-5 w-5" />
                </button>
                {children}
            </div>
        </div>
    );
}
