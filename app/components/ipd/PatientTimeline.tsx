'use client';

import { Activity, Pill, FlaskConical, Stethoscope, FileText, ArrowRightLeft, User, AlertTriangle } from 'lucide-react';

type EventType = 'ward_round' | 'note' | 'transfer' | 'vitals' | 'medication' | 'lab' | 'admission' | 'discharge';

interface TimelineEvent {
    _type: EventType;
    _date: Date;
    [key: string]: any;
}

interface PatientTimelineProps {
    events: TimelineEvent[];
    maxItems?: number;
}

const EVENT_CONFIG: Record<EventType, { icon: any; color: string; label: string }> = {
    ward_round: { icon: Stethoscope, color: 'bg-blue-100 text-blue-700', label: 'Ward Round' },
    note: { icon: FileText, color: 'bg-gray-100 text-gray-700', label: 'Clinical Note' },
    transfer: { icon: ArrowRightLeft, color: 'bg-purple-100 text-purple-700', label: 'Bed Transfer' },
    vitals: { icon: Activity, color: 'bg-green-100 text-green-700', label: 'Vitals' },
    medication: { icon: Pill, color: 'bg-amber-100 text-amber-700', label: 'Medication' },
    lab: { icon: FlaskConical, color: 'bg-cyan-100 text-cyan-700', label: 'Lab' },
    admission: { icon: User, color: 'bg-emerald-100 text-emerald-700', label: 'Admitted' },
    discharge: { icon: User, color: 'bg-red-100 text-red-700', label: 'Discharged' },
};

function eventSummary(event: TimelineEvent): string {
    switch (event._type) {
        case 'ward_round':
            if (event.subjective) {
                return `SOAP — ${event.round_type ?? 'Attending'}${event.escalation_required ? ' ⚠ Escalation' : ''}`;
            }
            return event.observations || 'Ward round documented';
        case 'note':
            return `${event.note_type ?? 'Note'}: ${String(event.details || '').slice(0, 80)}${String(event.details || '').length > 80 ? '…' : ''}`;
        case 'transfer':
            return `Transferred to ${event.to_bed_id ?? 'new bed'}`;
        case 'vitals':
            return `HR ${event.heart_rate ?? '?'} · BP ${event.bp_systolic ?? '?'}/${event.bp_diastolic ?? '?'} · SpO₂ ${event.spo2 ?? '?'}% · NEWS ${event.news_score ?? '?'}`;
        case 'medication':
            return `${event.medication_name} — ${event.status}`;
        case 'lab':
            return event.test_type ?? 'Lab test';
        case 'admission':
            return 'Admission started';
        case 'discharge':
            return 'Patient discharged';
        default:
            return '';
    }
}

export function PatientTimeline({ events, maxItems = 50 }: PatientTimelineProps) {
    const sorted = [...events]
        .sort((a, b) => b._date.getTime() - a._date.getTime())
        .slice(0, maxItems);

    if (sorted.length === 0) {
        return <p className="text-xs text-gray-400 italic text-center py-4">No events yet</p>;
    }

    return (
        <div className="space-y-0">
            {sorted.map((event, idx) => {
                const cfg = EVENT_CONFIG[event._type] ?? EVENT_CONFIG.note;
                const Icon = cfg.icon;
                return (
                    <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.color}`}>
                                <Icon className="h-3.5 w-3.5" />
                            </span>
                            {idx < sorted.length - 1 && (
                                <div className="w-px flex-1 bg-gray-200 mt-1 mb-1 min-h-[1rem]" />
                            )}
                        </div>
                        <div className="pb-4 flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{cfg.label}</span>
                                <span className="text-[9px] text-gray-400">
                                    {event._date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    {' · '}
                                    {event._date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                                {event.escalation_required && (
                                    <span className="text-[9px] font-black text-red-600 flex items-center gap-0.5">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Escalation
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{eventSummary(event)}</p>
                            {event._type === 'ward_round' && event.plan && (
                                <p className="text-[10px] text-purple-600 mt-0.5 line-clamp-1">P: {event.plan}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
