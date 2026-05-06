'use client';

/**
 * GAP 8 — Order Set / Saved Prescription Templates
 * GAP 9 — Investigation "My List" Feature
 * Doctor can create, manage, and apply order sets.
 */

import React, { useState, useEffect } from 'react';
import { Plus, Star, StarOff, Trash2, BookOpen, FlaskConical, Loader2, Search, Check } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { useSearchParams } from 'next/navigation';
import { getOrderSets, createOrderSet, deleteOrderSet, toggleOrderSetFavorite } from '@/app/actions/order-set-actions';
import { getDoctorInvestigationMyList, addToInvestigationMyList, removeFromInvestigationMyList, searchInvestigationLibrary } from '@/app/actions/investigation-mylist-actions';

type OrderSet = {
    id: string;
    name: string;
    description: string | null;
    chief_complaints: string[];
    diagnosis: Array<{ text: string; icd10_code?: string }>;
    advice_investigations: string[];
    advice_medications: Array<{ name: string; dosage?: string; frequency?: string }>;
    op_procedures: string[];
    is_favorite: boolean;
    usage_count: number;
};

type InvestigationFavorite = {
    id: string;
    investigation_name: string;
    category: string | null;
};

type InvestigationResult = {
    id: number;
    test_name: string;
    category: string | null;
    price: number;
};

export default function OrderSetsPage() {
    const searchParams = useSearchParams();
    const doctorId = searchParams.get('doctor_id') || '';
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'order_sets' | 'my_list'>('order_sets');
    const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
    const [myList, setMyList] = useState<InvestigationFavorite[]>([]);
    const [libResults, setLibResults] = useState<InvestigationResult[]>([]);
    const [libQuery, setLibQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [newSetDesc, setNewSetDesc] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!doctorId) { setLoading(false); return; }
        Promise.all([
            getOrderSets(doctorId),
            getDoctorInvestigationMyList(doctorId),
        ]).then(([osRes, mlRes]) => {
            if (osRes.success) setOrderSets(osRes.data as OrderSet[]);
            if (mlRes.success) setMyList(mlRes.data as InvestigationFavorite[]);
            setLoading(false);
        });
    }, [doctorId]);

    const handleSearchLib = async (q: string) => {
        setLibQuery(q);
        if (q.length < 2) { setLibResults([]); return; }
        const res = await searchInvestigationLibrary(q);
        if (res.success) setLibResults(res.data as InvestigationResult[]);
    };

    const handleAddToMyList = async (name: string, category?: string | null) => {
        const res = await addToInvestigationMyList(doctorId, name, category || undefined);
        if (res.success) {
            toast.success(`${name} added to My List`);
            const mlRes = await getDoctorInvestigationMyList(doctorId);
            if (mlRes.success) setMyList(mlRes.data as InvestigationFavorite[]);
        }
    };

    const handleRemoveFromMyList = async (name: string) => {
        const res = await removeFromInvestigationMyList(doctorId, name);
        if (res.success) {
            setMyList(prev => prev.filter(m => m.investigation_name !== name));
        }
    };

    const handleCreateOrderSet = async () => {
        if (!newSetName.trim()) return;
        setCreating(true);
        const res = await createOrderSet({ doctor_id: doctorId, name: newSetName, description: newSetDesc });
        setCreating(false);
        if (res.success) {
            toast.success('Order set created');
            setShowCreate(false);
            setNewSetName('');
            setNewSetDesc('');
            const osRes = await getOrderSets(doctorId);
            if (osRes.success) setOrderSets(osRes.data as OrderSet[]);
        } else {
            toast.error('Failed to create order set');
        }
    };

    const handleToggleFavorite = async (id: string, current: boolean) => {
        await toggleOrderSetFavorite(id, !current);
        setOrderSets(prev => prev.map(os => os.id === id ? { ...os, is_favorite: !current } : os));
    };

    const handleDelete = async (id: string) => {
        const res = await deleteOrderSet(id);
        if (res.success) {
            setOrderSets(prev => prev.filter(os => os.id !== id));
            toast.success('Order set deleted');
        }
    };

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Order Sets & My List</h1>
                        <p className="text-sm text-gray-500">Saved prescription templates and investigation favorites</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('order_sets')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'order_sets' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            <BookOpen className="w-4 h-4 inline mr-1.5" />Order Sets
                        </button>
                        <button
                            onClick={() => setActiveTab('my_list')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'my_list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            <FlaskConical className="w-4 h-4 inline mr-1.5" />My Investigation List
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <>
                        {/* Order Sets Tab */}
                        {activeTab === 'order_sets' && (
                            <div className="space-y-4">
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setShowCreate(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                                    >
                                        <Plus className="w-4 h-4" /> New Order Set
                                    </button>
                                </div>

                                {showCreate && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                                        <h3 className="font-medium text-blue-800">Create New Order Set</h3>
                                        <input
                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                                            placeholder="Order set name (e.g. Fever Protocol, Diabetic Workup)"
                                            value={newSetName}
                                            onChange={e => setNewSetName(e.target.value)}
                                        />
                                        <input
                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                                            placeholder="Description (optional)"
                                            value={newSetDesc}
                                            onChange={e => setNewSetDesc(e.target.value)}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleCreateOrderSet}
                                                disabled={creating || !newSetName.trim()}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                            >
                                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                Create
                                            </button>
                                            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
                                        </div>
                                    </div>
                                )}

                                {orderSets.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                        <BookOpen className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm">No order sets yet. Create your first one.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {orderSets.map(os => (
                                            <div key={os.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h3 className="font-semibold text-gray-900">{os.name}</h3>
                                                        {os.description && <p className="text-xs text-gray-500 mt-0.5">{os.description}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => handleToggleFavorite(os.id, os.is_favorite)} className="p-1 hover:bg-gray-100 rounded">
                                                            {os.is_favorite ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : <StarOff className="w-4 h-4 text-gray-400" />}
                                                        </button>
                                                        <button onClick={() => handleDelete(os.id)} className="p-1 hover:bg-red-50 rounded">
                                                            <Trash2 className="w-4 h-4 text-red-400" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-xs">
                                                    {os.chief_complaints?.length > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{os.chief_complaints.length} complaints</span>}
                                                    {os.diagnosis?.length > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{os.diagnosis.length} diagnoses</span>}
                                                    {os.advice_investigations?.length > 0 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{os.advice_investigations.length} investigations</span>}
                                                    {os.advice_medications?.length > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{os.advice_medications.length} medications</span>}
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-gray-400">
                                                    <span>Used {os.usage_count} times</span>
                                                    <button className="text-blue-600 hover:text-blue-700 font-medium">Apply to Prescription →</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* My Investigation List Tab */}
                        {activeTab === 'my_list' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* My List */}
                                <div className="space-y-3">
                                    <h2 className="font-semibold text-gray-800">My List ({myList.length})</h2>
                                    {myList.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                            <FlaskConical className="w-8 h-8 mb-2 opacity-30" />
                                            <p className="text-sm">Search the library and add investigations</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {myList.map(item => (
                                                <div key={item.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800">{item.investigation_name}</p>
                                                        {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFromMyList(item.investigation_name)}
                                                        className="text-red-400 hover:text-red-600 text-xs"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Library Search */}
                                <div className="space-y-3">
                                    <h2 className="font-semibold text-gray-800">Investigation Library</h2>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                        <input
                                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="Search investigations..."
                                            value={libQuery}
                                            onChange={e => handleSearchLib(e.target.value)}
                                        />
                                    </div>
                                    {libResults.length > 0 && (
                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                            {libResults.map(test => {
                                                const inMyList = myList.some(m => m.investigation_name === test.test_name);
                                                return (
                                                    <div key={test.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-800">{test.test_name}</p>
                                                            <p className="text-xs text-gray-400">{test.category} · ₹{test.price}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => !inMyList && handleAddToMyList(test.test_name, test.category)}
                                                            disabled={inMyList}
                                                            className={`text-xs px-2 py-1 rounded-lg font-medium ${inMyList ? 'bg-green-100 text-green-700 cursor-default' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                                        >
                                                            {inMyList ? '✓ Added' : '+ Add'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {libQuery.length >= 2 && libResults.length === 0 && (
                                        <p className="text-sm text-gray-400 text-center py-4">No investigations found</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}
