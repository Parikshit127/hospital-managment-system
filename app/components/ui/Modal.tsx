'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    className?: string;
}

const maxWidthMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
};

export function Modal({ isOpen, onClose, title, icon, children, maxWidth = 'lg', className = '' }: ModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm"
                onClick={onClose}
                style={{ animation: 'fadeIn 0.15s ease-out' }}
            />
            <div
                className={`relative bg-white rounded-2xl shadow-xl border border-gray-200/60 w-full ${maxWidthMap[maxWidth]} max-h-[90vh] overflow-y-auto ${className}`}
                style={{ animation: 'scaleIn 0.2s cubic-bezier(0.22, 1, 0.36, 1)', boxShadow: 'var(--shadow-xl)' }}
            >
                {(title || icon) && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80">
                        <div className="flex items-center gap-3">
                            {icon && (
                                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                                    {icon}
                                </div>
                            )}
                            {title && <h2 className="text-base font-bold text-gray-900 tracking-tight">{title}</h2>}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-150"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
