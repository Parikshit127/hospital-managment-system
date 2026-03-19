'use client';

import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function ReceptionError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
                <div className="mx-auto mb-6 h-20 w-20 rounded-2xl bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="h-10 w-10 text-red-400" />
                </div>
                <h2 className="text-xl font-black text-gray-900 mb-2">
                    Something went wrong
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                    {error.message || 'An unexpected error occurred in the reception module. Please try again.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" /> Go Back
                    </button>
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all"
                    >
                        <RefreshCw className="h-4 w-4" /> Try Again
                    </button>
                </div>
            </div>
        </div>
    );
}
