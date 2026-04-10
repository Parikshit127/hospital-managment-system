'use client';

import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';

export type PrescriptionData = {
    patient: {
        full_name: string;
        patient_id: string;
        age?: string | null;
        gender?: string | null;
        phone?: string | null;
    };
    doctor: {
        name: string;
        specialty?: string;
        reg_number?: string;
    };
    org: {
        name: string;
        address?: string;
        phone?: string;
    };
    date: string;
    diagnoses: Array<{ code?: string; name: string; type: string }>;
    medications: string[];
    instructions?: string;
    follow_up?: string;
};

interface PrescriptionPrintProps {
    data: PrescriptionData;
    onClose: () => void;
}

export function PrescriptionPrint({ data, onClose }: PrescriptionPrintProps) {
    const printRef = useRef<HTMLDivElement>(null);

    function handlePrint() {
        const content = printRef.current?.innerHTML;
        if (!content) return;
        const win = window.open('', '_blank', 'width=800,height=900');
        if (!win) return;
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Prescription — ${data.patient.full_name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Times New Roman', serif; color: #111; padding: 32px; font-size: 13px; }
                    .rx-header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .rx-org { font-size: 18px; font-weight: bold; }
                    .rx-org-sub { font-size: 11px; color: #444; margin-top: 2px; }
                    .rx-doctor { text-align: right; }
                    .rx-doctor-name { font-size: 15px; font-weight: bold; }
                    .rx-patient-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 10px 0; border-bottom: 1px solid #ccc; margin-bottom: 14px; }
                    .rx-label { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.05em; }
                    .rx-value { font-size: 13px; font-weight: bold; margin-top: 2px; }
                    .rx-section { margin-bottom: 16px; }
                    .rx-section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #444; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
                    .rx-diag { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
                    .rx-diag-code { font-size: 11px; color: #666; font-family: monospace; }
                    .rx-symbol { font-size: 28px; font-weight: bold; color: #333; float: left; margin-right: 12px; line-height: 1; }
                    .rx-med { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 8px; padding: 6px 0; border-bottom: 1px dotted #ddd; }
                    .rx-med-num { font-weight: bold; color: #444; min-width: 18px; }
                    .rx-footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #ccc; padding-top: 12px; }
                    .rx-sig { width: 180px; border-top: 1px solid #111; margin-top: 40px; text-align: center; font-size: 11px; padding-top: 4px; }
                    @media print { body { padding: 16px; } }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 400);
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                    <h3 className="font-black text-gray-900 text-sm">Prescription Preview</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700"
                        >
                            <Printer className="h-4 w-4" /> Print / Save PDF
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Preview */}
                <div className="p-6 overflow-y-auto max-h-[80vh]">
                    <div ref={printRef} className="font-serif text-sm text-gray-900">
                        {/* Header */}
                        <div className="rx-header flex justify-between items-end pb-3 mb-4 border-b-2 border-gray-900">
                            <div>
                                <p className="rx-org text-lg font-black">{data.org.name}</p>
                                {data.org.address && <p className="rx-org-sub text-xs text-gray-500">{data.org.address}</p>}
                                {data.org.phone && <p className="rx-org-sub text-xs text-gray-500">Ph: {data.org.phone}</p>}
                            </div>
                            <div className="text-right">
                                <p className="rx-doctor-name font-bold">Dr. {data.doctor.name}</p>
                                {data.doctor.specialty && <p className="text-xs text-gray-500">{data.doctor.specialty}</p>}
                                {data.doctor.reg_number && <p className="text-xs text-gray-400">Reg: {data.doctor.reg_number}</p>}
                            </div>
                        </div>

                        {/* Patient */}
                        <div className="grid grid-cols-3 gap-4 py-2.5 border-b border-gray-300 mb-4">
                            <div>
                                <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Patient</p>
                                <p className="font-bold text-sm">{data.patient.full_name}</p>
                            </div>
                            <div>
                                <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Age / Gender</p>
                                <p className="font-bold text-sm">{data.patient.age ? `${data.patient.age}y` : '—'} / {data.patient.gender || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Date / UHID</p>
                                <p className="font-bold text-sm">{new Date(data.date).toLocaleDateString('en-IN')}</p>
                                <p className="text-xs text-gray-400">{data.patient.patient_id}</p>
                            </div>
                        </div>

                        {/* Diagnoses */}
                        {data.diagnoses.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[9px] uppercase font-black tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Diagnosis</p>
                                {data.diagnoses.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-1">
                                        {d.code && <span className="text-[10px] font-mono text-gray-400">{d.code}</span>}
                                        <span className="text-sm font-bold">{d.name}</span>
                                        <span className="text-[9px] uppercase text-gray-400">({d.type})</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Rx */}
                        {data.medications.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-start gap-3 mb-2">
                                    <span className="text-4xl font-black text-gray-300 leading-none">℞</span>
                                    <p className="text-[9px] uppercase font-black tracking-widest text-gray-500 border-b border-gray-200 pb-1 flex-1 self-end">Medications</p>
                                </div>
                                {data.medications.map((med, i) => (
                                    <div key={i} className="flex gap-2 py-1.5 border-b border-dotted border-gray-200">
                                        <span className="font-bold text-gray-500 min-w-5">{i + 1}.</span>
                                        <span className="text-sm">{med}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Instructions */}
                        {data.instructions && (
                            <div className="mb-4">
                                <p className="text-[9px] uppercase font-black tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Instructions</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.instructions}</p>
                            </div>
                        )}

                        {/* Follow-up */}
                        {data.follow_up && (
                            <div className="mb-4">
                                <p className="text-[9px] uppercase font-black tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Follow-up</p>
                                <p className="text-sm font-bold">{data.follow_up}</p>
                            </div>
                        )}

                        {/* Footer / Signature */}
                        <div className="flex justify-end mt-10 pt-3 border-t border-gray-300">
                            <div className="text-center">
                                <div className="w-44 border-t border-gray-900 mt-10 pt-1">
                                    <p className="text-xs font-bold">Dr. {data.doctor.name}</p>
                                    <p className="text-[10px] text-gray-400">Signature</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
