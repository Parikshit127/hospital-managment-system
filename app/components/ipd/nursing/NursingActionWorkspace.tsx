'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserRound, BedDouble, Activity, Bell, Maximize2, Minimize2, Clock, CalendarDays } from 'lucide-react';
import { HistorySidebar } from './HistorySidebar';
import { QuickEntryConsole } from './QuickEntryConsole';

export function NursingActionWorkspace({ admission }: { admission: any }) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header / Identity Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center gap-6">
                    <Link href="/ipd/admissions-hub" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-lg font-black shadow-md">
                            {admission.patient?.full_name?.charAt(0) || 'P'}
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-gray-800">{admission.patient?.full_name || 'Unknown Patient'}</h1>
                            <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 mt-0.5">
                                <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> UID: {admission.patient?.patient_id}</span>
                                {admission.bed && (
                                    <>
                                        <span className="text-gray-300">|</span>
                                        <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> {admission.ward?.ward_name} - Bed {admission.bed?.bed_id?.startsWith(admission.bed?.organizationId + '-' + admission.bed?.ward_id + '-') ? admission.bed.bed_id.slice((admission.bed.organizationId + '-' + admission.bed.ward_id + '-').length) : admission.bed?.bed_id}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-lg text-rose-600 border border-rose-100">
                        <Activity className="h-4 w-4" />
                        <span className="text-xs font-bold">Dr. {admission.doctor_name || 'Unassigned'}</span>
                    </div>
                    <button className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors relative">
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
                    </button>
                </div>
            </div>

            {/* Main Action Area */}
            <div className="flex flex-1 overflow-hidden">
                
                {/* Left: Quick Entry Console (Taking 60-70% width) */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="max-w-4xl mx-auto">
                        <QuickEntryConsole admissionId={admission.admission_id} patientName={admission.patient?.full_name} />
                    </div>
                </div>

                {/* Right: History Timeline Sidebar (Taking 30-40% width) */}
                <div className="w-80 lg:w-96 border-l border-gray-200 bg-white overflow-y-auto shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
                    <HistorySidebar notes={admission.medical_notes} />
                </div>
            </div>
        </div>
    );
}
