'use client';

/**
 * Feature 380 — Teleconsultation
 * Patient can request video consultation with doctors
 */

import React, { useState, useEffect } from 'react';
import { Video, Stethoscope, Clock, CheckCircle, XCircle, Loader2, Calendar, ExternalLink } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { requestVideoCall } from '@/app/actions/video-call-actions';
import { getActiveDoctors } from '@/app/actions/doctor-list-actions';
import { usePatientDashboard } from '@/app/lib/hooks/usePatientData';

type Doctor = { id: string; name: string; specialty: string; consultation_fee: number };
type VideoRequest = {
    id: string; status: string; doctor_id: string;
    scheduled_at: string | null; meet_link: string | null;
    reason: string | null; request_date: string;
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    Pending: { color: 'bg-amber-100 text-amber-700', label: 'Awaiting Response' },
    Accepted: { color: 'bg-emerald-100 text-emerald-700', label: 'Accepted' },
    Rejected: { color: 'bg-red-100 text-red-700', label: 'Declined' },
    Completed: { color: 'bg-gray-100 text-gray-600', label: 'Completed' },
};

export default function TeleconsultationPage() {
    const toast = useToast();
    const { data: dashData } = usePatientDashboard();
    const patientId = (dashData as any)?.patient?.id || '';
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [requests, setRequests] = useState<VideoRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [reason, setReason] = useState('');
    const [requesting, setRequesting] = useState(false);
    const [activeTab, setActiveTab] = useState<'book' | 'history'>('book');

    useEffect(() => {
        Promise.all([
            getActiveDoctors().then(r => r.success ? setDoctors(r.data as Doctor[]) : null),
            fetch('/api/patient/video-calls').then(r => r.json()).then(d => d.success && setRequests(d.requests || [])),
        ]).finally(() => setLoading(false));
    }, []);

    const handleRequest = async () => {
        if (!selectedDoctor) { toast.error('Please select a doctor'); return; }
        setRequesting(true);
        const res = await requestVideoCall({ patientId, doctorId: selectedDoctor, reason });
        setRequesting(false);
        if (res.success) {
            toast.success('Video consultation requested! Doctor will confirm shortly.');
            setSelectedDoctor('');
            setReason('');
            // Refresh requests
            fetch('/api/patient/video-calls').then(r => r.json()).then(d => d.success && setRequests(d.requests || []));
        } else {
            toast.error(res.error || 'Request failed');
        }
    };

    const pendingRequests = requests.filter(r => r.status === 'Pending' || r.status === 'Accepted');

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
            <div className="mb-6">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Video className="h-6 w-6 text-purple-500" /> Teleconsultation
                </h2>
                <p className="text-sm text-gray-500 mt-1">Consult with doctors from the comfort of your home</p>
            </div>

            {/* Active calls banner */}
            {pendingRequests.map(req => (
                <div key={req.id} className={`mb-4 p-4 rounded-2xl border-2 flex items-center justify-between gap-4 ${req.status === 'Accepted' ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${req.status === 'Accepted' ? 'bg-emerald-500' : 'bg-amber-500'} text-white`}>
                            <Video className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-gray-900">{req.status === 'Accepted' ? 'Call Accepted!' : 'Request Pending'}</p>
                            <p className="text-xs text-gray-500">{req.status === 'Accepted' && req.scheduled_at ? `Scheduled: ${new Date(req.scheduled_at).toLocaleString('en-IN')}` : 'Waiting for doctor response...'}</p>
                        </div>
                    </div>
                    {req.status === 'Accepted' && req.meet_link && (
                        <a href={req.meet_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition">
                            Join Call <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>
            ))}

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
                {(['book', 'history'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${activeTab === tab ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {tab === 'book' ? 'Book Consultation' : 'History'}
                    </button>
                ))}
            </div>

            {activeTab === 'book' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
                    <h3 className="font-bold text-gray-800">Select Doctor</h3>
                    {loading ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-purple-500" /></div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                            {doctors.map(doc => (
                                <button key={doc.id} onClick={() => setSelectedDoctor(doc.id)}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${selectedDoctor === doc.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                                        <Stethoscope className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900 truncate">{doc.name}</p>
                                        <p className="text-xs text-gray-400">{doc.specialty}</p>
                                        <p className="text-xs font-bold text-purple-600 mt-0.5">₹{doc.consultation_fee}</p>
                                    </div>
                                    {selectedDoctor === doc.id && <CheckCircle className="w-4 h-4 text-purple-600 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Reason for Consultation</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)}
                            placeholder="Describe your symptoms or reason for consultation..."
                            rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none" />
                    </div>
                    <button onClick={handleRequest} disabled={requesting || !selectedDoctor}
                        className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                        {requesting ? <><Loader2 className="w-4 h-4 animate-spin" /> Requesting...</> : <><Video className="w-4 h-4" /> Request Video Consultation</>}
                    </button>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-3">
                    {requests.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Video className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No consultation history</p>
                        </div>
                    ) : requests.map(req => {
                        const cfg = STATUS_CONFIG[req.status] || { color: 'bg-gray-100 text-gray-600', label: req.status };
                        return (
                            <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4">
                                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Video className="w-5 h-5 text-purple-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gray-900">{req.reason || 'Video Consultation'}</p>
                                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(req.request_date).toLocaleDateString('en-IN')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                                    {req.status === 'Accepted' && req.meet_link && (
                                        <a href={req.meet_link} target="_blank" rel="noopener noreferrer"
                                            className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
