'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useParams } from 'next/navigation';
import { User, Bed, Clock, ClipboardEdit, Utensils, MoveRight, Stethoscope, FileText, CheckCircle2 } from 'lucide-react';
import { getAdmissionFullDetails, createNursingTask } from '@/app/actions/ipd-actions';

export default function AdmissionDetailPage() {
    const params = useParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [taskType, setTaskType] = useState('Vitals');
    const [desc, setDesc] = useState('');
    const [time, setTime] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getAdmissionFullDetails(params.id as string);
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [params.id]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await createNursingTask({
            admission_id: data.admission_id,
            task_type: taskType,
            description: desc,
            scheduled_at: time
        });
        if (res.success) {
            setTaskType('Vitals'); setDesc(''); setTime('');
            loadData();
        } else {
            alert('Failed to create task');
        }
    };

    if (loading) return <AppShell pageTitle="Loading"><div className="p-12 text-center text-gray-500 font-medium">Loading admission record...</div></AppShell>;
    if (!data) return <AppShell pageTitle="Not Found"><div className="p-12 text-center text-red-500 font-bold">Admission not found.</div></AppShell>;

    return (
        <AppShell
            pageTitle="IPD Patient Chart"
            pageIcon={<Bed className="h-5 w-5" />}
        >
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-teal-500"></div>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                {data.patient?.full_name}
                                <span className={`text-xs px-2 py-1 rounded-md uppercase tracking-wider font-bold ${data.status === 'Admitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>{data.status}</span>
                            </h2>
                            <div className="mt-2 text-sm font-medium text-gray-500 flex flex-wrap gap-x-6 gap-y-2">
                                <span className="flex items-center gap-1"><User className="h-4 w-4" /> {data.patient?.age} yrs, {data.patient?.gender}</span>
                                <span className="flex items-center gap-1"><Bed className="h-4 w-4" /> Ward: {data.bed?.wards?.ward_name} ({data.bed_id})</span>
                                <span className="flex items-center gap-1"><Stethoscope className="h-4 w-4" /> Dr. {data.doctor_name}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Admission Date</p>
                            <p className="text-sm font-black text-gray-900">{new Date(data.admission_date).toLocaleString()}</p>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-2">Diagnosis</p>
                            <p className="text-sm font-bold text-teal-700">{data.diagnosis}</p>
                        </div>
                    </div>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Timeline */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 overflow-hidden">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2"><Clock className="h-4 w-4 text-teal-600" /> Clinical Timeline</h3>

                            <div className="relative border-l-2 border-gray-100 ml-3 space-y-8 pl-6">
                                {/* Ward Rounds */}
                                {data.ward_rounds?.map((r: any) => (
                                    <div key={r.id} className="relative">
                                        <span className="absolute -left-[35px] bg-blue-100 rounded-full p-1.5 border-4 border-white shadow-sm"><Stethoscope className="h-4 w-4 text-blue-600" /></span>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(r.created_at).toLocaleString()}</p>
                                        <div className="bg-gray-50 rounded-xl p-4 mt-1 border border-gray-100">
                                            <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-1">Ward Round (Dr. {data.doctor_name})</p>
                                            <p className="text-sm text-gray-800"><strong className="text-gray-500">O:</strong> {r.observations}</p>
                                            <p className="text-sm text-gray-800"><strong className="text-gray-500">A/P:</strong> {r.plan_changes}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Transfers */}
                                {data.bed_transfers?.map((t: any) => (
                                    <div key={t.id} className="relative">
                                        <span className="absolute -left-[35px] bg-amber-100 rounded-full p-1.5 border-4 border-white shadow-sm"><MoveRight className="h-4 w-4 text-amber-600" /></span>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(t.created_at).toLocaleString()}</p>
                                        <div className="bg-amber-50/50 rounded-xl p-3 mt-1 border border-amber-100 text-sm">
                                            Moved from <strong className="text-amber-700">{t.from_bed_id}</strong> to <strong className="text-amber-700">{t.to_bed_id}</strong>
                                            <span className="block text-xs text-gray-500 mt-1 italic">"{t.reason}"</span>
                                        </div>
                                    </div>
                                ))}

                                {/* Generic Notes */}
                                {data.medical_notes?.map((n: any) => (
                                    <div key={n.note_id} className="relative">
                                        <span className="absolute -left-[35px] bg-gray-100 rounded-full p-1.5 border-4 border-white shadow-sm"><FileText className="h-4 w-4 text-gray-600" /></span>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(n.created_at).toLocaleString()}</p>
                                        <div className="bg-white rounded-xl p-3 mt-1 border border-gray-200 text-sm shadow-sm">
                                            <span className="text-[10px] uppercase font-bold text-teal-600 mb-1 block">General Note / Form</span>
                                            {n.details}
                                        </div>
                                    </div>
                                ))}

                                <div className="relative">
                                    <span className="absolute -left-[35px] bg-emerald-100 rounded-full p-1.5 border-4 border-white shadow-sm"><ChevronsDown className="h-4 w-4 text-emerald-600" /></span>
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Admission Initiated</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions & Current State */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Active Diet Plan */}
                        <div className="bg-orange-50 rounded-2xl border border-orange-100 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-orange-800 uppercase tracking-widest mb-3 flex items-center gap-2"><Utensils className="h-4 w-4" /> Active Diet Status</h3>
                            {data.diet_plans?.filter((d: any) => d.is_active).length > 0 ? (
                                data.diet_plans.filter((d: any) => d.is_active).map((d: any) => (
                                    <div key={d.id}>
                                        <p className="font-black text-xl text-orange-600 mb-2">{d.diet_type}</p>
                                        <p className="text-xs font-medium text-orange-800">{d.instructions}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm font-bold text-gray-500">No active diet assigned. (NPO presumed)</p>
                            )}
                        </div>

                        {/* Nursing Tasks */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2"><ClipboardEdit className="h-4 w-4 text-purple-600" /> Nursing Orders</h3>

                            <form onSubmit={handleAddTask} className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-xs font-bold text-gray-600 mb-3 uppercase">Dispatch New Task</p>
                                <div className="space-y-3 focus-within:ring-0">
                                    <select value={taskType} onChange={e => setTaskType(e.target.value)} className="w-full text-sm p-2 bg-white border border-gray-200 rounded-lg">
                                        <option>Vitals</option><option>Medication</option><option>Procedure Prep</option><option>Hygiene</option>
                                    </select>
                                    <input type="datetime-local" required value={time} onChange={e => setTime(e.target.value)} className="w-full text-sm p-2 bg-white border border-gray-200 rounded-lg text-gray-600" />
                                    <textarea required value={desc} onChange={e => setDesc(e.target.value)} placeholder="Spec/instructions..." className="w-full text-sm p-2 bg-white border border-gray-200 rounded-lg h-16 resize-none" />
                                    <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg text-xs transition-colors shadow-sm">Order Task</button>
                                </div>
                            </form>

                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {data.nursing_tasks?.length > 0 ? data.nursing_tasks.map((t: any) => (
                                    <div key={t.id} className="p-3 border border-gray-100 rounded-xl flex items-start gap-3">
                                        {t.status === 'Completed' ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> : <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
                                        <div>
                                            <p className={`text-sm font-bold ${t.status === 'Completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.description}</p>
                                            <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase">
                                                {t.task_type} • {new Date(t.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                )) : <p className="text-xs text-center text-gray-400 py-4 font-medium">No nursing tasks logged.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}

// Inline mock icon to fix lucide miss
const ChevronsDown = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" /></svg>;
