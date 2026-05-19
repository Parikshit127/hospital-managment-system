'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Loader2, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { useToast } from '@/app/components/ui/Toast';
import { getRegistrationFieldConfig, updateFieldConfig } from '@/app/actions/registration-config-actions';

interface FieldConfig {
  id: string;
  field_name: string;
  display_label: string;
  is_required: boolean;
  is_visible: boolean;
  sort_order: number;
}

export default function RegistrationConfigPage() {
  const toast = useToast();
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const res = await getRegistrationFieldConfig();
    if (res.success) setFields(res.data as FieldConfig[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleToggle = async (id: string, field: 'is_required' | 'is_visible', current: boolean) => {
    const newValue = !current;
    // Optimistic update
    setFields(prev => prev.map(f => f.id === id ? { ...f, [field]: newValue } : f));
    setUpdating(id + field);
    const res = await updateFieldConfig(id, { [field]: newValue });
    setUpdating(null);
    if (res.success) {
      toast.success('Configuration saved');
    } else {
      // Revert on failure
      setFields(prev => prev.map(f => f.id === id ? { ...f, [field]: current } : f));
      toast.error('Failed to save configuration');
    }
  };

  return (
    <AdminPage
      pageTitle="Registration Field Configuration"
      pageIcon={<Settings className="h-5 w-5" />}
      onRefresh={loadConfig}
      refreshing={loading}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Configure which fields are required or visible during patient registration.
        </p>

        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Sort Order', 'Field Name', 'Display Label', 'Visible', 'Required'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                    </td>
                  </tr>
                ) : fields.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16">
                      <p className="text-gray-400 text-sm">No configuration found</p>
                    </td>
                  </tr>
                ) : fields.map(field => (
                  <tr key={field.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono w-20">
                      {field.sort_order}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                      {field.field_name}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {field.display_label}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(field.id, 'is_visible', field.is_visible)}
                        disabled={updating === field.id + 'is_visible'}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                          field.is_visible
                            ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {updating === field.id + 'is_visible' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : field.is_visible ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                        {field.is_visible ? 'Visible' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(field.id, 'is_required', field.is_required)}
                        disabled={updating === field.id + 'is_required'}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                          field.is_required
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {updating === field.id + 'is_required' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : field.is_required ? (
                          <CheckSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                        {field.is_required ? 'Required' : 'Optional'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
