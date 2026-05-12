'use client';

/**
 * Feature 371 — Request for Ambulance
 */

import React, { useState } from 'react';
import { Ambulance, MapPin, Phone, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';

export default function AmbulancePage() {
    const toast = useToast();
    const [form, setForm] = useState({ pickup_address: '', contact_phone: '', emergency_type: 'Medical Emergency', notes: '' });
    const [loading, setLoading] = useState(false);
    const [requested, setRequested] = useState<{ request_id: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.pickup_address.trim()) { toast.error('Pickup address is required'); return; }
        if (!form.contact_phone.trim()) { toast.error('Contact phone is required'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/patient/ambulance-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                setRequested({ request_id: data.request_id });
            } else {
                toast.error(data.error || 'Request failed');
            }
        } catch {
            toast.error('Something went wrong');
        }
        setLoading(false);
    };

    if (requested) {
        return (
            <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-5">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Ambulance className="w-10 h-10 text-red-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">Ambulance Requested!</h2>
                <p className="text-gray-500 text-sm">Your request has been received. Our team will contact you shortly.</p>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Request ID</p>
                    <p className="text-xl font-black text-red-700 font-mono">{requested.request_id}</p>
                </div>
                <p className="text-sm text-gray-500">For immediate help, call <a href="tel:108" className="text-red-600 font-bold">108</a></p>
                <button onClick={() => setRequested(null)} className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition text-sm">
                    New Request
                </button>
            </div>
        );
    }

    const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500";

    return (
        <div className="max-w-lg mx-auto px-4 sm:px-6 pb-20">
            <div className="mb-6">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Ambulance className="h-6 w-6 text-red-500" /> Request Ambulance
                </h2>
                <p className="text-sm text-gray-500 mt-1">For life-threatening emergencies, call <strong>108</strong> directly</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">
                    For immediate life-threatening emergencies, please call <strong>108</strong> (National Ambulance) directly. This form is for scheduled/non-emergency transport.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Emergency Type</label>
                    <select value={form.emergency_type} onChange={e => setForm(f => ({ ...f, emergency_type: e.target.value }))} className={inputCls}>
                        {['Medical Emergency', 'Accident', 'Cardiac Emergency', 'Maternity', 'Scheduled Transfer', 'Other'].map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Pickup Address *</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                        <textarea required value={form.pickup_address} onChange={e => setForm(f => ({ ...f, pickup_address: e.target.value }))}
                            placeholder="Full pickup address with landmark..."
                            rows={3} className={`${inputCls} pl-10 resize-none`} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contact Phone *</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                        <input required value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                            placeholder="Phone number at pickup location" className={`${inputCls} pl-10`} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Additional Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Patient condition, floor number, any special requirements..."
                        rows={2} className={`${inputCls} resize-none`} />
                </div>
                <button type="submit" disabled={loading}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Requesting...</> : <><Ambulance className="w-5 h-5" /> Request Ambulance</>}
                </button>
            </form>
        </div>
    );
}
