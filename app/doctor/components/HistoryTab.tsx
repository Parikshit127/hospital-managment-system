'use client';

import React from 'react';
import { History } from 'lucide-react';

interface HistoryTabProps {
    history: any[];
    loadingHistory: boolean;
}

export function HistoryTab({ history, loadingHistory }: HistoryTabProps) {
    return (
        <div className="max-w-4xl space-y-6">
            <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2 text-lg"><History className="h-5 w-5 text-violet-400" /> Patient History</h3>
            {loadingHistory ? <div className="text-center py-12 text-gray-400 font-bold">Loading history...</div> : history.length === 0 ? (
                <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">No previous records found.</div>
            ) : (<div className="space-y-4">{history.map((record, i) => (
                <div key={i} className="bg-gray-50 border border-gray-200 p-5 rounded-xl hover:border-teal-500/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                        <div><p className="font-bold text-teal-400 text-base">{record.diagnosis || 'No Diagnosis'}</p><p className="text-xs text-gray-400 mt-1">{new Date(record.created_at).toLocaleDateString()} &bull; {record.doctor_name || 'Dr. Unknown'}</p></div>
                        <div className="bg-gray-100 text-gray-400 text-[10px] uppercase font-black px-2 py-1 rounded-lg border border-gray-200">#{record.appointment_id}</div>
                    </div>
                    <p className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">{record.doctor_notes}</p>
                </div>
            ))}</div>)}
        </div>
    );
}
