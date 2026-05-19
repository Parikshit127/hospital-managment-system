'use client';

import Breadcrumbs from './Breadcrumbs';
import { User } from 'lucide-react';

interface TopbarProps {
    userName?: string;
    userRole?: string;
}

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrator',
    superadmin: 'Super Admin',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    nurse: 'Nurse',
    pharmacist: 'Pharmacist',
    finance: 'Finance',
    hr: 'HR',
    lab_technician: 'Lab Technician',
};

export default function Topbar({ userName, userRole }: TopbarProps) {
    const roleLabel = userRole ? (ROLE_LABELS[userRole] ?? userRole) : '';

    return (
        <header
            className="h-[52px] shrink-0 flex items-center justify-between px-5 sm:px-8 lg:px-10"
            style={{
                backgroundColor: 'var(--admin-surface)',
                borderBottom: '1px solid var(--admin-border)',
            }}
        >
            <Breadcrumbs />

            {userName && (
                <div className="flex items-center gap-2 ml-auto">
                    <div
                        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--admin-primary), var(--admin-primary-dark))' }}
                    >
                        <User className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="hidden sm:block text-right">
                        <p className="text-[12px] font-semibold text-gray-800 leading-none">{userName}</p>
                        {roleLabel && (
                            <p className="text-[10px] text-gray-500 mt-0.5 leading-none capitalize">{roleLabel}</p>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}
