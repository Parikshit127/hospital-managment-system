'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Cpu, Loader2, Send, Wand2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { getLabOrders } from '@/app/actions/lab-actions';
import { buildSampleOru } from '@/app/lib/lab/hl7';

type PendingOrder = { order_id: string; patient_name: string; test_type: string };

export default function AnalyzerSimulatorPage() {
    const toast = useToast();
    const [orders, setOrders] = useState<PendingOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [barcode, setBarcode] = useState('');
    const [value, setValue] = useState('');
    const [unit, setUnit] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [response, setResponse] = useState<any>(null);

    const load = async () => {
        setLoading(true);
        const res = await getLabOrders('Pending');
        if (res.success) setOrders(res.data as PendingOrder[]);
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const selected = orders.find(o => o.order_id === barcode);

    const generate = () => {
        if (!selected) { toast.error('Select a pending order first'); return; }
        if (!value.trim()) { toast.error('Enter a result value'); return; }
        setMessage(buildSampleOru({
            barcode: selected.order_id,
            testName: selected.test_type,
            value: value.trim(),
            unit: unit.trim(),
            timestamp: new Date().toISOString(),
        }));
    };

    const send = async () => {
        if (!message.trim()) { toast.error('Generate or paste an HL7 message first'); return; }
        setSending(true);
        setResponse(null);
        try {
            const res = await fetch('/api/lab/analyzer/result', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: message,
            });
            const json = await res.json();
            setResponse({ status: res.status, ...json });
            if (json.success) { toast.success(`Result imported for ${json.barcode}`); load(); }
            else toast.error(json.error || 'Import failed');
        } catch (e: any) {
            toast.error('Request failed');
            setResponse({ error: String(e) });
        } finally {
            setSending(false);
        }
    };

    return (
        <AppShell pageTitle="Analyzer Simulator" pageIcon={<Cpu className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-500 mb-4">
                        Simulates a lab analyzer sending results over HL7. Pick a pending order, enter a value, <b>Generate</b> the
                        HL7 message, then <b>Send</b> — the order is auto-completed (with flagging + notifications) exactly as a real
                        analyzer feed would. Endpoint: <code className="bg-gray-100 px-1 rounded">POST /api/lab/analyzer/result</code>.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pending Order</label>
                            <select value={barcode} onChange={e => setBarcode(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                <option value="">{loading ? 'Loading...' : orders.length ? 'Select a pending order...' : 'No pending orders'}</option>
                                {orders.map(o => (
                                    <option key={o.order_id} value={o.order_id}>{o.order_id} — {o.test_type} — {o.patient_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Result Value</label>
                            <input value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 8.5"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Unit</label>
                            <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. g/dL"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                        </div>
                        <div className="flex items-end">
                            <button onClick={generate} className="w-full inline-flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold py-2 rounded-lg text-sm">
                                <Wand2 className="h-4 w-4" /> Generate
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">HL7 ORU Message</label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)} rows={7}
                        placeholder="Generate from a pending order above, or paste a raw HL7 ORU^R01 message..."
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none" />
                    <div className="flex justify-end mt-3">
                        <button onClick={send} disabled={sending} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-xl text-sm shadow-sm disabled:opacity-50">
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Send to Analyzer Endpoint
                        </button>
                    </div>
                </div>

                {response && (
                    <div className={`bg-white border rounded-2xl p-5 shadow-sm ${response.success ? 'border-emerald-200' : 'border-rose-200'}`}>
                        <h3 className="text-sm font-bold text-gray-900 mb-2">Response (HTTP {response.status ?? '—'})</h3>
                        <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-x-auto text-gray-700">{JSON.stringify(response, null, 2)}</pre>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
