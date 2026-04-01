"use client";

import React, { useState } from "react";
import { 
    Video, X, Clock, Calendar, Link as LinkIcon, 
    Loader2, RefreshCw, User, ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { respondToVideoCall } from "@/app/actions/video-call-actions";

// Ensure URL is absolute — prevents browser treating it as a relative path
const safeUrl = (url?: string) => {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
};

interface Req {
    id: string;
    status: string;
    request_date: string;
    scheduled_at?: string;
    meet_link?: string;
    reason?: string;
    patient?: { full_name: string; patient_id: string; phone?: string };
}

interface Props {
    session: any;
    initialData: Req[];
}

export default function DoctorVideoCallsClient({ session, initialData }: Props) {
    const [requests, setRequests] = useState<Req[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<Req | null>(null);
    const [scheduleTime, setScheduleTime] = useState("");
    const [meetLink, setMeetLink] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const refresh = async () => {
        setLoading(true);
        const { getAllCallRequests } = await import("@/app/actions/video-call-actions");
        const res = await getAllCallRequests(session.id);
        if (res.success) setRequests(res.data);
        setLoading(false);
    };

    const handleResponse = async (status: "Accepted" | "Rejected") => {
        if (!selectedRequest || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await respondToVideoCall({
                requestId: selectedRequest.id,
                status,
                scheduledAt: status === "Accepted" ? scheduleTime : undefined,
                meetLink: status === "Accepted" ? meetLink : undefined,
            });
            if (res.success) {
                setShowModal(false);
                setScheduleTime(""); setMeetLink("");
                refresh();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputCls = "w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all font-medium text-gray-700 placeholder:text-gray-300";
    const labelCls = "text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2 block ml-1";

    const upcoming = requests.filter(r => r.status === "Accepted" && r.scheduled_at && new Date(r.scheduled_at).toDateString() === new Date().toDateString());
    const pending   = requests.filter(r => r.status === "Pending");

    return (
        <>
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <Link href="/doctor/dashboard" className="p-2 hover:bg-rose-50 rounded-xl transition-colors text-rose-400">
                                    <ArrowLeft className="h-5 w-5" />
                                </Link>
                                <Video className="h-8 w-8 text-rose-500" />
                                <h1 className="text-3xl font-black tracking-tight text-gray-900">Video Consultations</h1>
                            </div>
                            <p className="text-gray-400 font-medium ml-12">Manage patient video call requests & scheduled sessions</p>
                        </div>
                        <button onClick={refresh} className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all text-gray-400 hover:text-teal-500">
                            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-6">
                        {[
                            { label: "Upcoming Today", value: upcoming.length, color: "text-emerald-600" },
                            { label: "Pending Requests", value: pending.length, color: "text-amber-500" },
                            { label: "Total Consultations", value: requests.length, color: "text-teal-600" },
                        ].map(s => (
                            <div key={s.label} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                                <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Cards */}
                    {requests.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-gray-200 rounded-[3rem] py-32 flex flex-col items-center text-center">
                            <Video className="h-16 w-16 text-gray-100 mb-4" />
                            <h3 className="text-xl font-black text-gray-300 uppercase mb-1">No Consultations Yet</h3>
                            <p className="text-gray-300 font-medium">Patient requests will appear here instantly.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {requests.map((req) => (
                                <div key={req.id} className="bg-white rounded-[2rem] border border-gray-100 p-7 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all group overflow-hidden relative">
                                    <div className={`absolute top-0 right-0 px-5 py-2 rounded-bl-3xl text-[10px] font-black uppercase tracking-widest ${
                                        req.status === "Accepted" ? "bg-emerald-500 text-white" :
                                        req.status === "Rejected" ? "bg-rose-500 text-white" :
                                        "bg-amber-400 text-white"
                                    }`}>{req.status}</div>

                                    <div className="flex items-start gap-5">
                                        <div className="h-14 w-14 rounded-3xl bg-gray-50 flex items-center justify-center border border-gray-100 group-hover:bg-rose-50 group-hover:border-rose-100 transition-colors shrink-0">
                                            <User className="h-7 w-7 text-gray-300 group-hover:text-rose-400 transition-colors" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-lg font-black text-gray-800 uppercase tracking-tight truncate pr-16">{req.patient?.full_name}</h4>
                                            <p className="text-xs text-gray-400 font-bold mb-3">ID: {req.patient?.patient_id}</p>
                                            
                                            <div className="space-y-2 text-sm">
                                                <div className="flex items-center gap-2 text-gray-500 font-medium">
                                                    <Calendar className="h-4 w-4 text-gray-300 shrink-0" />
                                                    <span>Requested {new Date(req.request_date).toLocaleString()}</span>
                                                </div>
                                                {req.scheduled_at && (
                                                    <div className="flex items-center gap-2 text-teal-600 font-black bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-100 w-fit">
                                                        <Clock className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="text-xs">{new Date(req.scheduled_at).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {req.reason && (
                                                    <p className="text-xs text-gray-400 italic bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">"{req.reason}"</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-5 border-t border-gray-50 flex gap-3">
                                        {req.status === "Pending" ? (
                                            <button
                                                onClick={() => { setSelectedRequest(req); setShowModal(true); }}
                                                className="flex-1 py-3.5 bg-gray-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-800 transition-all active:scale-95"
                                            >
                                                Process Request
                                            </button>
                                        ) : req.status === "Accepted" && req.meet_link ? (
                                            <button
                                                onClick={() => window.open(safeUrl(req.meet_link), '_blank', 'noopener,noreferrer')}
                                                className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest text-center shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                            >
                                                Join Video Call
                                            </button>
                                        ) : (
                                            <div className="flex-1 text-center py-3 text-gray-300 font-black uppercase text-[10px] tracking-widest">
                                                {req.status === "Rejected" ? "Request Declined" : "Awaiting Action"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Modal */}
            {showModal && selectedRequest && (
                <div className="fixed inset-0 z-[100] bg-gray-900/50 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/60">
                            <h3 className="font-black text-xl flex items-center gap-3">
                                <Video className="h-6 w-6 text-rose-500" /> Schedule Video Call
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="flex items-center gap-4 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                                    <User className="h-5 w-5 text-rose-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Patient</p>
                                    <p className="text-base font-black text-gray-800 uppercase">{selectedRequest.patient?.full_name}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={labelCls}>Schedule Date & Time</label>
                                    <input type="datetime-local" className={inputCls} value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                                </div>
                                <div>
                                    <label className={labelCls}>Meeting Link (Google Meet / Zoom)</label>
                                    <div className="relative">
                                        <input type="url" className={`${inputCls} pl-12`} placeholder="https://meet.google.com/xxx-yyyy-zzz" value={meetLink} onChange={e => setMeetLink(e.target.value)} />
                                        <LinkIcon className="h-5 w-5 text-gray-300 absolute left-4 top-1/2 -translate-y-1/2" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 pt-2">
                                <button
                                    onClick={() => handleResponse("Accepted")}
                                    disabled={!scheduleTime || !meetLink || isSubmitting}
                                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-2xl shadow-xl shadow-teal-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest text-sm"
                                >
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Approve & Notify Patient"}
                                </button>
                                <button
                                    onClick={() => handleResponse("Rejected")}
                                    disabled={isSubmitting}
                                    className="w-full py-3 text-gray-400 font-black hover:text-rose-500 transition-colors uppercase tracking-widest text-[11px]"
                                >
                                    Decline Request
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
