// app/components/registration/VoiceFormMirror.tsx — [A] Registration form mirror
// Renders the same fields as the manual registration form, progressively populated
// by voice. Tap-correctable: the user can type corrections directly.
'use client';

import React from 'react';
import { User, Phone, Mail, Calendar, Building2 } from 'lucide-react';
import type { FormData, OrgOption } from '@/lib/registration/field-fsm';
import type { FieldName } from '@/lib/registration/field-specs';

interface VoiceFormMirrorProps {
  formData: FormData;
  organisations: OrgOption[];
  currentFieldIndex: number;
  onManualChange: (field: FieldName, value: string) => void;
  disabled?: boolean;
}

export function VoiceFormMirror({
  formData,
  organisations,
  currentFieldIndex,
  onManualChange,
  disabled,
}: VoiceFormMirrorProps) {
  // text-base (16px) on mobile avoids iOS Safari's auto-zoom-on-focus for small inputs.
  const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white transition-all duration-200";
  const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";
  const activeCls = "ring-[3px] ring-emerald-500/40 border-emerald-500 bg-emerald-50 shadow-lg transform scale-[1.02] z-10 transition-all duration-300";

  // Map field index to field name for highlighting
  const fieldNames: FieldName[] = [
    'hospital', 'full_name', 'phone', 'email', 'date_of_birth', 'age',
    'gender', 'blood_group',
  ];
  const activeField = fieldNames[currentFieldIndex];

  const getFieldClass = (field: FieldName, extraCls?: string) => {
    const isActive = activeField === field;
    const hasValue = !!(formData as any)[field === 'hospital' ? 'hospital_name' : field];
    return `${inputCls} ${extraCls || ''} ${isActive ? activeCls : ''} ${hasValue ? 'text-gray-900' : 'text-gray-400'} ${disabled ? 'opacity-75' : ''}`;
  };

  return (
    <div className="space-y-4">
      {/* Hospital Selection */}
      <div>
        <label className={labelCls}>Select Hospital / Clinic *</label>
        <div className="relative">
          <Building2 className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
          <select
            value={formData.hospital}
            onChange={e => {
              const org = organisations.find(o => o.slug === e.target.value);
              if (org) onManualChange('hospital', org.name);
            }}
            className={getFieldClass('hospital', 'pl-10')}
            disabled={disabled}
          >
            <option value="">-- Select Organisation --</option>
            {organisations.map(o => (
              <option key={o.id} value={o.slug}>
                {o.name}{o.address ? ` — ${o.address}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full Name */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Full Name *</label>
          <div className="relative">
            <User className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <input
              value={formData.full_name}
              onChange={e => onManualChange('full_name', e.target.value)}
              placeholder="Enter your full name"
              className={getFieldClass('full_name', 'pl-10')}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className={labelCls}>Phone Number *</label>
          <div className="relative">
            <Phone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <input
              value={formData.phone}
              onChange={e => onManualChange('phone', e.target.value)}
              placeholder="10-digit mobile number"
              className={getFieldClass('phone', 'pl-10')}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls}>Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={formData.email}
              onChange={e => onManualChange('email', e.target.value)}
              placeholder="your@email.com"
              className={getFieldClass('email', 'pl-10')}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Date of Birth */}
        <div>
          <label className={labelCls}>Date of Birth</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={formData.date_of_birth}
              onChange={e => onManualChange('date_of_birth', e.target.value)}
              className={getFieldClass('date_of_birth', 'pl-10')}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Age */}
        <div>
          <label className={labelCls}>Age</label>
          <input
            value={formData.age}
            onChange={e => onManualChange('age', e.target.value)}
            placeholder="Age in years"
            type="number"
            min="0"
            max="120"
            className={getFieldClass('age')}
            disabled={disabled}
          />
        </div>

        {/* Gender */}
        <div>
          <label className={labelCls}>Gender *</label>
          <select
            value={formData.gender}
            onChange={e => onManualChange('gender', e.target.value)}
            className={getFieldClass('gender')}
            disabled={disabled}
          >
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>

        {/* Blood Group */}
        <div>
          <label className={labelCls}>Blood Group</label>
          <select
            value={formData.blood_group}
            onChange={e => onManualChange('blood_group', e.target.value)}
            className={getFieldClass('blood_group')}
            disabled={disabled}
          >
            <option value="">Select</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
              <option key={bg}>{bg}</option>
            ))}
          </select>
        </div>

      </div>
    </div>
  );
}

export default VoiceFormMirror;
