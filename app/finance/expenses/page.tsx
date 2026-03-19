'use client';

import { useState, useEffect } from 'react';
import {
    getExpenses, createExpense, approveExpense, markExpensePaid, rejectExpense,
    getExpenseCategories, getExpenseDashboardStats
} from '@/app/actions/expense-actions';
import { getVendors } from '@/app/actions/expense-actions';
import {
    Plus, Search, Filter, CheckCircle, XCircle, CreditCard,
    TrendingDown, Clock, AlertCircle, IndianRupee, Receipt
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function ExpensesPage() {
    const [tab, setTab] = useState<'overview' | 'expenses' | 'categories'>('overview');
    const [expenses, setExpenses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showPayModal, setShowPayModal] = useState<any>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadData();
    }, [statusFilter]);

    async function loadData() {
        setLoading(true);
        const [expRes, catRes, venRes, statsRes] = await Promise.all([
            getExpenses({ status: statusFilter || undefined }),
            getExpenseCategories(),
            getVendors(),
            getExpenseDashboardStats(),
        ]);
        if (expRes.success) setExpenses(expRes.data);
        if (catRes.success) setCategories(catRes.data);
        if (venRes.success) setVendors(venRes.data);
        if (statsRes.success) setStats(statsRes.data);
        setLoading(false);
    }

    const filteredExpenses = expenses.filter(e =>
        !search || e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
        e.vendor?.vendor_name?.toLowerCase().includes(search.toLowerCase())
    );

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    return (
        <AppShell pageTitle="Expense Management" pageIcon={<TrendingDown className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Expense Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Track and manage all hospital expenses</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowAddCategory(true)} className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                        + Category
                    </button>
                    <button onClick={() => setShowAddExpense(true)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2">
                        <Plus className="h-4 w-4" /> New Expense
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
                {(['overview', 'expenses', 'categories'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'overview' ? 'Overview' : t === 'expenses' ? 'All Expenses' : 'Categories'}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {tab === 'overview' && (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard icon={<TrendingDown className="h-5 w-5" />} label="This Month" value={fmt(stats?.thisMonthTotal || 0)} color="red" />
                        <KPICard icon={<IndianRupee className="h-5 w-5" />} label="Today's Expenses" value={fmt(stats?.todayTotal || 0)} color="orange" />
                        <KPICard icon={<Clock className="h-5 w-5" />} label="Pending Approval" value={String(stats?.pendingApproval || 0)} color="amber" />
                        <KPICard icon={<Receipt className="h-5 w-5" />} label="Total Expenses" value={fmt(stats?.totalExpenses || 0)} color="gray" />
                    </div>

                    {/* Recent Expenses */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="font-semibold text-gray-900">Recent Expenses</h3>
                        </div>
                        <ExpenseTable
                            expenses={expenses.slice(0, 10)}
                            onApprove={async (id) => { await approveExpense(id); loadData(); }}
                            onReject={async (id) => { const r = prompt('Rejection reason:'); if (r) { await rejectExpense(id, r); loadData(); } }}
                            onPay={(e) => setShowPayModal(e)}
                        />
                    </div>
                </div>
            )}

            {/* All Expenses Tab */}
            {tab === 'expenses' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="text" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">
                            <option value="">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Paid">Paid</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <ExpenseTable
                            expenses={filteredExpenses}
                            onApprove={async (id) => { await approveExpense(id); loadData(); }}
                            onReject={async (id) => { const r = prompt('Rejection reason:'); if (r) { await rejectExpense(id, r); loadData(); } }}
                            onPay={(e) => setShowPayModal(e)}
                        />
                        {filteredExpenses.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                <p className="font-medium">No expenses found</p>
                                <p className="text-sm mt-1">Create your first expense to get started</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Categories Tab */}
            {tab === 'categories' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Expense Categories</h3>
                        <button onClick={() => setShowAddCategory(true)} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">+ Add Category</button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {categories.map(cat => (
                            <div key={cat.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                <div>
                                    <p className="font-medium text-gray-900">{cat.name}</p>
                                    <p className="text-xs text-gray-500">Code: {cat.code} {cat.parent?.name ? `• Parent: ${cat.parent.name}` : ''}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400">{cat._count?.expenses || 0} expenses</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {cat.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                <p className="font-medium">No categories yet</p>
                                <p className="text-sm mt-1">Add categories like Salaries, Utilities, Medical Supplies, etc.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Expense Modal */}
            {showAddExpense && (
                <AddExpenseModal
                    categories={categories}
                    vendors={vendors}
                    onClose={() => setShowAddExpense(false)}
                    onSave={async (data) => {
                        const res = await createExpense(data);
                        if (res.success) { setShowAddExpense(false); loadData(); }
                        return res;
                    }}
                />
            )}

            {/* Add Category Modal */}
            {showAddCategory && (
                <AddCategoryModal
                    categories={categories}
                    onClose={() => setShowAddCategory(false)}
                    onSave={async (data) => {
                        const { addExpenseCategory } = await import('@/app/actions/expense-actions');
                        const res = await addExpenseCategory(data);
                        if (res.success) { setShowAddCategory(false); loadData(); }
                        return res;
                    }}
                />
            )}

            {/* Pay Expense Modal */}
            {showPayModal && (
                <PayExpenseModal
                    expense={showPayModal}
                    onClose={() => setShowPayModal(null)}
                    onSave={async (paymentData) => {
                        const res = await markExpensePaid(showPayModal.id, paymentData);
                        if (res.success) { setShowPayModal(null); loadData(); }
                        return res;
                    }}
                />
            )}
        </div>
        </AppShell>
    );
}

function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    const colorMap: Record<string, string> = {
        red: 'bg-red-50 text-red-600',
        orange: 'bg-orange-50 text-orange-600',
        amber: 'bg-amber-50 text-amber-600',
        gray: 'bg-gray-50 text-gray-600',
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
                <span className="text-sm text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    );
}

function ExpenseTable({ expenses, onApprove, onReject, onPay }: {
    expenses: any[]; onApprove: (id: number) => void; onReject: (id: number) => void; onPay: (e: any) => void;
}) {
    const statusColors: Record<string, string> = {
        Pending: 'bg-amber-50 text-amber-700',
        Approved: 'bg-blue-50 text-blue-700',
        Paid: 'bg-emerald-50 text-emerald-700',
        Rejected: 'bg-red-50 text-red-700',
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Expense #</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Amount</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {expenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 text-sm font-mono text-gray-600">{exp.expense_number}</td>
                            <td className="px-6 py-3 text-sm text-gray-900 max-w-[200px] truncate">{exp.description}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{exp.category?.name || '-'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{exp.vendor?.vendor_name || '-'}</td>
                            <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">
                                {Number(exp.total_amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-6 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[exp.status] || 'bg-gray-100 text-gray-600'}`}>
                                    {exp.status}
                                </span>
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-500">
                                {new Date(exp.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-6 py-3">
                                <div className="flex items-center gap-1">
                                    {exp.status === 'Pending' && (
                                        <>
                                            <button onClick={() => onApprove(exp.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Approve">
                                                <CheckCircle className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => onReject(exp.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Reject">
                                                <XCircle className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                    {exp.status === 'Approved' && (
                                        <button onClick={() => onPay(exp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Mark Paid">
                                            <CreditCard className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function AddExpenseModal({ categories, vendors, onClose, onSave }: {
    categories: any[]; vendors: any[]; onClose: () => void; onSave: (data: any) => Promise<any>;
}) {
    const [form, setForm] = useState({
        category_id: '', vendor_id: '', description: '', amount: '', tax_amount: '',
        payment_method: '', reference_no: '', notes: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.category_id || !form.description || !form.amount) {
            setError('Category, description, and amount are required');
            return;
        }
        setSaving(true);
        setError('');
        const res = await onSave({
            category_id: parseInt(form.category_id),
            vendor_id: form.vendor_id ? parseInt(form.vendor_id) : undefined,
            description: form.description,
            amount: parseFloat(form.amount),
            tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : 0,
            payment_method: form.payment_method || undefined,
            reference_no: form.reference_no || undefined,
            notes: form.notes || undefined,
        });
        if (!res.success) setError(res.error || 'Failed to create expense');
        setSaving(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">New Expense</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">
                                <option value="">Select category</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                            <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">
                                <option value="">No vendor</option>
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                        <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Expense description" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (INR) *</label>
                            <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="0.00" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Amount</label>
                            <input type="number" step="0.01" value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="0.00" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                            <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">
                                <option value="">Select method</option>
                                <option value="Cash">Cash</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reference No.</label>
                            <input type="text" value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Ref / Cheque No." />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Optional notes" />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                        <button type="submit" disabled={saving}
                            className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Create Expense'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function AddCategoryModal({ categories, onClose, onSave }: {
    categories: any[]; onClose: () => void; onSave: (data: any) => Promise<any>;
}) {
    const [form, setForm] = useState({ name: '', code: '', parent_id: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name || !form.code) { setError('Name and code are required'); return; }
        setSaving(true);
        setError('');
        const res = await onSave({
            name: form.name,
            code: form.code,
            parent_id: form.parent_id ? parseInt(form.parent_id) : undefined,
        });
        if (!res.success) setError(res.error || 'Failed to add category');
        setSaving(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Add Category</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
                        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Medical Supplies" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                        <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. MED-SUP" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                        <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">None (Top Level)</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                            {saving ? 'Saving...' : 'Add Category'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PayExpenseModal({ expense, onClose, onSave }: {
    expense: any; onClose: () => void; onSave: (data: any) => Promise<any>;
}) {
    const [form, setForm] = useState({ payment_method: 'Bank Transfer', reference_no: '' });
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        await onSave({ payment_method: form.payment_method, reference_no: form.reference_no });
        setSaving(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">Mark as Paid</h2>
                    <p className="text-sm text-gray-500">{expense.expense_number} — {Number(expense.total_amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                            <option value="UPI">UPI</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference No.</label>
                        <input type="text" value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Transaction / Cheque No." />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                            {saving ? 'Processing...' : 'Mark Paid'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
