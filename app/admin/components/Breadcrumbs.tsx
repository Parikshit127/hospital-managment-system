'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ADMIN_NAV_LABEL_MAP } from '@/lib/navigation/admin-nav';

const SEGMENT_LABELS: Record<string, string> = {
    admin: 'Admin',
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    opd: 'OPD',
    ipd: 'IPD',
    'ipd-setup': 'IPD Setup',
    'ipd-finance': 'IPD Finance',
    'ot-setup': 'OT Setup',
    lab: 'Lab',
    pharmacy: 'Pharmacy',
    finance: 'Finance',
    'finance-master': 'Finance Master',
    billing: 'Billing',
    approvals: 'Approvals',
    writeoffs: 'Write-offs',
    hr: 'HR',
    ot: 'Operation Theatre',
    er: 'Emergency Room',
    staff: 'Staff & Users',
    doctors: 'Doctors',
    departments: 'Departments',
    patients: 'Patients',
    roles: 'Roles & Permissions',
    master: 'Master Data',
    settings: 'Settings',
    branding: 'Branding',
    templates: 'Templates',
    notifications: 'Notifications',
    integrations: 'Integrations',
    audit: 'Audit Trail',
    reports: 'Reports',
    workflows: 'Workflows',
    'data-import': 'Data Import',
    branches: 'Branches',
    'api-docs': 'API Documentation',
    'mfa-setup': 'MFA Setup',
    'registration-config': 'Registration Config',
    'discount-schemes': 'Discount Schemes',
    'doctor-leave': 'Doctor Leave',
    'finance-settings': 'Finance Settings',
};

function labelForSegment(segment: string): string {
    return SEGMENT_LABELS[segment] ?? segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Breadcrumbs() {
    const pathname = usePathname();

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length <= 1) return null; // at /admin root, no breadcrumb needed

    const crumbs: { label: string; href: string }[] = [];
    let accumulated = '';
    for (const seg of segments) {
        accumulated += `/${seg}`;
        const href = accumulated;
        // Try exact nav label first, then segment label map
        const label = ADMIN_NAV_LABEL_MAP[href] ?? labelForSegment(seg);
        crumbs.push({ label, href });
    }

    return (
        <nav className="flex items-center gap-1 text-[12px]" aria-label="Breadcrumb">
            {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                    <span key={crumb.href} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
                        {isLast ? (
                            <span className="font-medium text-gray-700">{crumb.label}</span>
                        ) : (
                            <Link
                                href={crumb.href}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {crumb.label}
                            </Link>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
