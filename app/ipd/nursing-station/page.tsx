'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, ClipboardCheck, Clock, CheckCircle } from 'lucide-react';
import { getNursingTasks, completeNursingTask } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function NursingStationPage() {
    const toast = useToast();
    const [tasks, setTasks] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [currentTask, setCurrentTask] = useState<any>(null);
    const [notes, setNotes] = useState('');

    const loadTasks = async () => {
        setRefreshing(true);
        const res = await getNursingTasks();
        if (res.success) setTasks(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadTasks(); }, []);

    const handleComplete = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await completeNursingTask(currentTask.id, notes);
        if (res.success) {
            setModalOpen(false);
            setNotes('');
            loadTasks();
        } else {
            toast.error('Failed to complete task.');
        }
    };

    const getTaskStyle = (type: string) => {
        switch (type) {
            case 'Vitals': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Medication': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <AppShell
            pageTitle="Nursing Station"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadTasks}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.length > 0 ? tasks.map((task: any) => (
                    <div key={task.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${getTaskStyle(task.task_type)}`}>
                                {task.task_type}
                            </span>
                            <span className="text-xs font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(task.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <h3 className="font-bold text-gray-900">{task.description}</h3>
                        <p className="text-sm text-gray-500 mb-4 truncate mt-1">Patient: {task.admission?.patient?.full_name} ({task.admission?.bed_id})</p>

                        <button
                            onClick={() => { setCurrentTask(task); setModalOpen(true); }}
                            className="w-full text-center flex items-center justify-center gap-2 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 text-gray-700 border border-gray-200 hover:border-teal-200 font-bold py-2 rounded-xl transition-colors text-sm"
                        >
                            <ClipboardCheck className="h-4 w-4" /> Mark Completed
                        </button>
                    </div>
                )) : (
                    <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                        <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <h3 className="font-bold text-gray-900 mb-1">No Pending Tasks</h3>
                        <p className="text-sm">Great job! All nursing tasks are caught up.</p>
                    </div>
                )}
            </div>

            {/* Completion Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleComplete} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">Complete Task</h3>
                            <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900">&times;</button>
                        </div>
                        <div className="p-6">
                            <p className="text-sm mb-4 font-medium text-gray-700">Add any nursing notes or vitals readings for <strong className="text-teal-700 uppercase">{currentTask?.task_type}</strong> completion:</p>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="E.g., BP 120/80, Temp normal..."
                                className="w-full p-3 border border-gray-200 rounded-xl mb-4 h-24 focus:ring-2 focus:ring-teal-500/20 text-sm"
                            />
                            <div className="flex gap-3 justify-end">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold">Cancel</button>
                                <button type="submit" className="px-5 py-2 flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-sm">
                                    <CheckCircle className="h-4 w-4" /> Save Completion
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
