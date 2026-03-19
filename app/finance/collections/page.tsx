'use client';

import { useState, useEffect } from 'react';
import {
    getDunningRules, createDunningRule, updateDunningRule,
    getOverdueInvoices, executeDunning, getDunningLog,
} from '@/app/actions/dunning-actions';
import {
    Loader2, Plus, Bell, AlertTriangle, Clock,
    Search, IndianRupee, X, Settings, Send, CheckCircle,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function CollectionsPage() {
    const [activeTab, setActiveTab] = useState<'overdue' | 'rules' | 'log'>('overdue');
    const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Dunning execution
    const [executing, setExecuting] = useState(false);

    // Rule modal
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [ruleForm, setRuleForm] = useState({
        rule_name: '', days_overdue: '', action_type: 'notification', template_text: '',
    });
    const [ruleLoading, setRuleLoading] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [overdueRes, rulesRes, logsRes] = await Promise.all([
            getOverdueInvoices(),
            getDunningRules(),
            getDunningLog(),
        ]);
        if (overdueRes.success) setOverdueInvoices(overdueRes.data || []);
        if (rulesRes.success) setRules(rulesRes.data || []);
        if (logsRes.success) setLogs(logsRes.data || []);
        setLoading(false);
    }

    async function handleCreateRule() {
        if (!ruleForm.rule_name || !ruleForm.days_overdue || !ruleForm.template_text) return;
        setRuleLoading(true);
        const res = await createDunningRule({
            rule_name: ruleForm.rule_name,
            days_overdue: parseInt(ruleForm.days_overdue),
            action_type: ruleForm.action_type,
            template_text: ruleForm.template_text,
        });
        if (res.success) {
            setShowRuleModal(false);
            setRuleForm({ rule_name: '', days_overdue: '', action_type: 'notification', template_text: '' });
            loadData();
        } else {
            alert(res.error);
        }
        setRuleLoading(false);
    }

    async function handleToggleRule(id: number, currentActive: boolean) {
        const res = await updateDunningRule(id, { is_active: !currentActive });
        if (res.success) loadData();
    }

    async function handleExecuteDunning() {
        if (!confirm('Run auto-dunning? This will send reminders for overdue invoices based on your rules.')) return;
        setExecuting(true);
        const res = await executeDunning();
        if (res.success) {
            alert(`Dunning completed: ${res.data?.actionsCreated} reminders sent`);
            loadData();
        } else {
            alert(res.error);
        }
        setExecuting(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const getAgingColor = (days: number) => {
        if (days <= 30) return 'text-amber-600 bg-amber-50';
        if (days <= 60) return 'text-orange-600 bg-orange-50';
        return 'text-red-600 bg-red-50';
    };

    const totalOverdue = overdueInvoices.reduce((s, inv) => s + Number(inv.balance_due || 0), 0);
    const over30 = overdueInvoices.filter(inv => inv.daysOverdue > 30).length;
    const over60 = overdueInvoices.filter(inv => inv.daysOverdue > 60).length;

    const filteredOverdue = overdueInvoices.filter(inv => {
        if (!search) return true;
        const q = search.toLowerCase();
        return inv.invoice_number?.toLowerCase().includes(q) ||
            inv.patient_id?.toLowerCase().includes(q) ||
            inv.patient?.full_name?.toLowerCase().includes(q);
    });

    return (
        <AppShell pageTitle="Collections & Dunning" pageIcon={<Bell className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Collections & Dunning</h1>
                    <p className="text-sm text-gray-500 mt-1">Track overdue invoices and automate payment reminders</p>
                </div>
                <button onClick={handleExecuteDunning} disabled={executing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm disabled:opacity-50">
                    {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Run Auto-Dunning
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
                                <span className="text-sm text-gray-500">Total Overdue</span>
                            </div>
                            <p className="text-2xl font-bold text-red-600">{fmt(totalOverdue)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-amber-50 rounded-lg"><Clock className="h-5 w-5 text-amber-600" /></div>
                                <span className="text-sm text-gray-500">Overdue Invoices</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{overdueInvoices.length}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-orange-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
                                <span className="text-sm text-gray-500">Over 30 Days</span>
                            </div>
                            <p className="text-2xl font-bold text-orange-600">{over30}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
                                <span className="text-sm text-gray-500">Over 60 Days</span>
                            </div>
                            <p className="text-2xl font-bold text-red-600">{over60}</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 border-b border-gray-200 pb-1">
                        {([
                            { key: 'overdue', label: 'Overdue Invoices', icon: AlertTriangle },
                            { key: 'rules', label: 'Dunning Rules', icon: Settings },
                            { key: 'log', label: 'Reminder Log', icon: Bell },
                        ] as const).map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition flex items-center gap-2 ${activeTab === tab.key ? 'bg-white text-emerald-700 border border-b-0 border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                                <tab.icon className="h-4 w-4" /> {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Overdue Invoices Tab */}
                    {activeTab === 'overdue' && (
                        <>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input type="text" placeholder="Search by invoice #, patient ID, or name..." value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance Due</th>
                                                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Days Overdue</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOverdue.length === 0 ? (
                                                <tr><td colSpan={7} className="py-16 text-center text-gray-400 text-sm">No overdue invoices found</td></tr>
                                            ) : filteredOverdue.map(inv => (
                                                <tr key={inv.id} className="hover:bg-gray-50">
                                                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                                                    <td className="px-5 py-3 text-sm text-gray-600">
                                                        <div>{inv.patient?.full_name || inv.patient_id}</div>
                                                    </td>
                                                    <td className="px-5 py-3 text-sm font-semibold text-red-600 text-right">{fmt(Number(inv.balance_due))}</td>
                                                    <td className="px-5 py-3 text-center">
                                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${getAgingColor(inv.daysOverdue)}`}>
                                                            {inv.daysOverdue}d
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-sm text-gray-600">{inv.status}</td>
                                                    <td className="px-5 py-3 text-sm text-gray-500">{inv.patient?.phone || '—'}</td>
                                                    <td className="px-5 py-3 text-sm text-gray-500">{new Date(inv.created_at).toLocaleDateString('en-IN')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Dunning Rules Tab */}
                    {activeTab === 'rules' && (
                        <>
                            <div className="flex justify-end">
                                <button onClick={() => setShowRuleModal(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                                    <Plus className="h-4 w-4" /> Add Rule
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rules.length === 0 ? (
                                    <div className="col-span-full py-16 text-center text-gray-400 text-sm">
                                        No dunning rules configured. Create rules to automate payment reminders.
                                    </div>
                                ) : rules.map(rule => (
                                    <div key={rule.id} className={`bg-white rounded-xl border p-5 ${rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-bold text-gray-900">{rule.rule_name}</h3>
                                            <button onClick={() => handleToggleRule(rule.id, rule.is_active)}
                                                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${rule.is_active ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>
                                                {rule.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-600">Trigger after <span className="font-semibold">{rule.days_overdue}</span> days overdue</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Bell className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-600 capitalize">{rule.action_type}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg mt-2">{rule.template_text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Reminder Log Tab */}
                    {activeTab === 'log' && (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient ID</th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action Taken</th>
                                            <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.length === 0 ? (
                                            <tr><td colSpan={4} className="py-16 text-center text-gray-400 text-sm">No dunning actions recorded yet</td></tr>
                                        ) : logs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50">
                                                <td className="px-5 py-3 text-sm text-gray-600">{new Date(log.created_at).toLocaleDateString('en-IN')}</td>
                                                <td className="px-5 py-3 text-sm text-gray-600">{log.patient_id}</td>
                                                <td className="px-5 py-3 text-sm text-gray-900 max-w-[300px] truncate">{log.action_taken}</td>
                                                <td className="px-5 py-3 text-center">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200">
                                                        <CheckCircle className="h-3 w-3" /> {log.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Create Rule Modal */}
            {showRuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Create Dunning Rule</h3>
                            <button onClick={() => setShowRuleModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
                                <input type="text" value={ruleForm.rule_name} onChange={e => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                                    placeholder="e.g. First Reminder" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Days Overdue *</label>
                                    <input type="number" value={ruleForm.days_overdue} onChange={e => setRuleForm({ ...ruleForm, days_overdue: e.target.value })}
                                        placeholder="e.g. 7" min="1" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                                    <select value={ruleForm.action_type} onChange={e => setRuleForm({ ...ruleForm, action_type: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                        <option value="notification">Notification</option>
                                        <option value="flag">Flag Only</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Template *</label>
                                <textarea value={ruleForm.template_text} onChange={e => setRuleForm({ ...ruleForm, template_text: e.target.value })}
                                    rows={3} placeholder="Dear patient, your invoice of {amount} is overdue by {days} days. Please clear the balance at your earliest convenience."
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                                <p className="text-xs text-gray-400 mt-1">Use {'{amount}'} and {'{days}'} as placeholders</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowRuleModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleCreateRule} disabled={ruleLoading || !ruleForm.rule_name || !ruleForm.days_overdue || !ruleForm.template_text}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2">
                                {ruleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Create Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
