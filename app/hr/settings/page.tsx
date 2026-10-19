'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Settings2, Loader2, Save, Plus, Trash2, LocateFixed, Pencil } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { useToast } from '@/app/components/ui/Toast';
import {
    getHrPolicySettings, updateHrPolicy, getLeaveTypes, saveLeaveType, getHolidays, addHoliday, deleteHoliday,
} from '@/app/actions/hr-actions';
import { fmtIstDate } from '@/app/lib/ist';
import { istTodayKey } from '@/app/lib/hr/hr-dates';
import { Card, inputCls, labelCls, primaryBtn, ghostBtn } from '@/app/components/hr/HrBits';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function PolicyCard() {
    const toast = useToast();
    const [p, setP] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getHrPolicySettings().then((r: any) => r.success && setP({
            ...r.data, lat: r.data.geofence?.lat ?? '', lng: r.data.geofence?.lng ?? '', radiusM: r.data.geofence?.radiusM ?? 200,
        }));
    }, []);

    if (!p) return <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></Card>;

    const useMyLocation = () => {
        navigator.geolocation?.getCurrentPosition(
            pos => setP({ ...p, lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }),
            () => toast.error('Could not read your location'), { enableHighAccuracy: true, timeout: 12000 });
    };

    const save = async () => {
        setSaving(true);
        const hasFence = p.lat !== '' && p.lng !== '';
        const res: any = await updateHrPolicy({
            workStart: p.workStart, workEnd: p.workEnd, graceMinutes: Number(p.graceMinutes),
            fullDayHours: Number(p.fullDayHours), halfDayHours: Number(p.halfDayHours),
            weeklyOffDays: p.weeklyOffDays, requireGeo: p.requireGeo,
            geofence: hasFence ? { lat: Number(p.lat), lng: Number(p.lng), radiusM: Number(p.radiusM) } : null,
            regularizationWindowDays: Number(p.regularizationWindowDays), leaveBackdateDays: Number(p.leaveBackdateDays),
        });
        setSaving(false);
        if (res.success) toast.success('Attendance policy saved'); else toast.error(res.error || 'Could not save');
    };

    const num = (k: string, label: string, step = 1) => (
        <div><label className={labelCls}>{label}</label>
            <input type="number" step={step} min={0} className={inputCls} value={p[k]} onChange={e => setP({ ...p, [k]: e.target.value })} /></div>
    );

    return (
        <Card className="p-6">
            <h3 className="text-sm font-black text-gray-900 mb-4">Attendance policy</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className={labelCls}>Work starts</label><input type="time" className={inputCls} value={p.workStart} onChange={e => setP({ ...p, workStart: e.target.value })} /></div>
                <div><label className={labelCls}>Work ends</label><input type="time" className={inputCls} value={p.workEnd} onChange={e => setP({ ...p, workEnd: e.target.value })} /></div>
                {num('graceMinutes', 'Late grace (min)')}
                {num('regularizationWindowDays', 'Correction window (days)')}
                {num('fullDayHours', 'Full-day hours', 0.5)}
                {num('halfDayHours', 'Half-day hours', 0.5)}
                {num('leaveBackdateDays', 'Leave back-date limit (days)')}
            </div>
            <p className={`${labelCls} mt-5`}>Weekly off</p>
            <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                    <button key={d} type="button"
                        onClick={() => setP({ ...p, weeklyOffDays: p.weeklyOffDays.includes(i) ? p.weeklyOffDays.filter((x: number) => x !== i) : [...p.weeklyOffDays, i] })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${p.weeklyOffDays.includes(i) ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-500 border-gray-200'}`}>{d}</button>
                ))}
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <input type="checkbox" checked={p.requireGeo} onChange={e => setP({ ...p, requireGeo: e.target.checked })} />
                    Require location when punching (geofence)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                    <div><label className={labelCls}>Latitude</label><input className={inputCls} value={p.lat} onChange={e => setP({ ...p, lat: e.target.value })} /></div>
                    <div><label className={labelCls}>Longitude</label><input className={inputCls} value={p.lng} onChange={e => setP({ ...p, lng: e.target.value })} /></div>
                    {num('radiusM', 'Radius (m)')}
                    <div className="flex items-end"><button type="button" onClick={useMyLocation} className={ghostBtn}><LocateFixed className="h-3.5 w-3.5" /> Use my location</button></div>
                </div>
            </div>
            <button onClick={save} disabled={saving} className={`${primaryBtn} mt-6`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy</button>
        </Card>
    );
}

function LeaveTypesCard() {
    const toast = useToast();
    const [types, setTypes] = useState<any[] | null>(null);
    const [edit, setEdit] = useState<any | null>(null);

    const load = useCallback(async () => { const r = await getLeaveTypes(); setTypes(r.success ? r.data : []); }, []);
    useEffect(() => { load(); }, [load]);

    const save = async () => {
        const res: any = await saveLeaveType({
            id: edit.id, name: edit.name, daysPerYear: Number(edit.days_per_year),
            isPaid: edit.is_paid, carryForward: edit.carry_forward, isActive: edit.is_active,
        });
        if (res.success) { toast.success('Leave type saved'); setEdit(null); load(); } else toast.error(res.error || 'Could not save');
    };

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-gray-900">Leave types</h3>
                <button className={ghostBtn} onClick={() => setEdit({ name: '', days_per_year: 12, is_paid: true, carry_forward: false, is_active: true })}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            {edit && (
                <div className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                    <div className="col-span-2"><label className={labelCls}>Name</label><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
                    <div><label className={labelCls}>Days / year</label><input type="number" min={0} className={inputCls} value={edit.days_per_year} onChange={e => setEdit({ ...edit, days_per_year: e.target.value })} /></div>
                    <div className="flex flex-col gap-1 text-xs font-semibold text-gray-700">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={edit.is_paid} onChange={e => setEdit({ ...edit, is_paid: e.target.checked })} /> Paid</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
                    </div>
                    <div className="flex gap-2"><button className={primaryBtn} onClick={save}>Save</button><button className={ghostBtn} onClick={() => setEdit(null)}>Cancel</button></div>
                </div>
            )}
            {types === null ? <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> : types.length === 0 ? (
                <p className="text-sm text-gray-400">No leave types yet — add Casual, Sick, Earned etc. Employees cannot apply until at least one exists.</p>
            ) : (
                <table className="w-full text-sm">
                    <tbody>
                        {types.map(t => (
                            <tr key={t.id} className="border-b border-gray-50">
                                <td className="py-2.5 font-bold text-gray-800">{t.name}{!t.is_active && <span className="ml-2 text-[10px] text-gray-400">inactive</span>}</td>
                                <td className="py-2.5 text-gray-600">{t.days_per_year} days / year</td>
                                <td className="py-2.5 text-gray-500 text-xs">{t.is_paid ? 'Paid' : 'Unpaid'}</td>
                                <td className="py-2.5 text-right"><button className={ghostBtn} onClick={() => setEdit(t)}><Pencil className="h-3 w-3" /> Edit</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    );
}

function HolidaysCard() {
    const toast = useToast();
    const [year, setYear] = useState(Number(istTodayKey().slice(0, 4)));
    const [list, setList] = useState<any[] | null>(null);
    const [form, setForm] = useState({ date: '', name: '' });

    const load = useCallback(async () => { setList(null); const r = await getHolidays(year); setList(r.success ? r.data : []); }, [year]);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        const res: any = await addHoliday({ date: form.date, name: form.name });
        if (res.success) { setForm({ date: '', name: '' }); load(); } else toast.error(res.error || 'Could not add');
    };
    const remove = async (id: number) => {
        const res: any = await deleteHoliday(id);
        if (res.success) load(); else toast.error(res.error || 'Could not delete');
    };

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-gray-900">Holidays</h3>
                <select className={`${inputCls} w-28`} value={year} onChange={e => setYear(Number(e.target.value))}>
                    {[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y}>{y}</option>)}
                </select>
            </div>
            <div className="flex flex-wrap gap-3 items-end mb-4">
                <div><label className={labelCls}>Date</label><DateField className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="flex-1 min-w-48"><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" maxLength={100} /></div>
                <button className={primaryBtn} disabled={!form.date || !form.name.trim()} onClick={add}><Plus className="h-4 w-4" /> Add</button>
            </div>
            {list === null ? <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> : list.length === 0 ? (
                <p className="text-sm text-gray-400">No holidays added for {year}.</p>
            ) : (
                <ul className="divide-y divide-gray-50">
                    {list.map(h => (
                        <li key={h.id} className="py-2 flex items-center justify-between text-sm">
                            <span><b className="text-gray-800">{h.name}</b> <span className="text-gray-500">· {fmtIstDate(h.date)}</span></span>
                            <button className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => remove(h.id)} aria-label={`Delete ${h.name}`}><Trash2 className="h-4 w-4" /></button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

export default function HRSettingsPage() {
    return (
        <AppShell pageTitle="HR Settings" pageIcon={<Settings2 className="h-5 w-5" />}>
            <div className="space-y-5 max-w-4xl">
                <PolicyCard />
                <LeaveTypesCard />
                <HolidaysCard />
            </div>
        </AppShell>
    );
}
