import {
    LayoutDashboard, LineChart,
    Stethoscope, Bed, BedDouble, FlaskConical, Pill, DollarSign, Receipt, CreditCard, Briefcase,
    Users, UserCog, Building2, ShieldCheck, UserRound,
    Settings, Palette, FileText, Bell, Plug, Clock, BarChart3, Lock,
    Workflow, Scissors, GitBranch, DatabaseBackup, BookOpen, Database,
    ShieldAlert, Scale, Siren, SlidersHorizontal,
    type LucideIcon,
} from 'lucide-react';

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    permissions?: string[];
}

export interface NavSection {
    title: string;
    collapsible?: boolean;
    items: NavItem[];
}

export const ADMIN_NAV_SECTIONS: NavSection[] = [
    {
        title: 'Overview',
        items: [
            { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
            { label: 'Analytics', href: '/admin/analytics', icon: LineChart },
        ],
    },
    {
        title: 'Modules',
        collapsible: true,
        items: [
            { label: 'OPD', href: '/admin/opd', icon: Stethoscope },
            { label: 'IPD', href: '/admin/ipd', icon: Bed },
            { label: 'IPD Setup', href: '/admin/ipd-setup', icon: BedDouble },
            { label: 'IPD Finance', href: '/admin/ipd-finance', icon: CreditCard },
            { label: 'OT Setup', href: '/admin/ot-setup', icon: Scissors },
            { label: 'Lab', href: '/admin/lab', icon: FlaskConical },
            { label: 'Pharmacy', href: '/admin/pharmacy', icon: Pill },
            { label: 'Finance', href: '/admin/finance', icon: DollarSign },
            { label: 'Finance Master', href: '/admin/finance-master', icon: Receipt },
            { label: 'Master Billing', href: '/admin/billing', icon: FileText },
            { label: 'Approval Center', href: '/admin/billing/approvals', icon: ShieldAlert },
            { label: 'Write-offs', href: '/admin/billing/writeoffs', icon: Scale },
            { label: 'HR', href: '/admin/hr', icon: Briefcase },
            { label: 'Operation Theatre', href: '/admin/ot/dashboard', icon: Scissors },
            { label: 'Emergency Room', href: '/admin/er/dashboard', icon: Siren },
        ],
    },
    {
        title: 'People',
        collapsible: true,
        items: [
            { label: 'Staff & Users', href: '/admin/staff', icon: Users },
            { label: 'Doctors', href: '/admin/doctors', icon: UserCog },
            { label: 'Departments', href: '/admin/departments', icon: Building2 },
            { label: 'Patients', href: '/admin/patients', icon: UserRound },
            { label: 'Roles & Permissions', href: '/admin/roles', icon: ShieldCheck },
        ],
    },
    {
        title: 'Master Data',
        items: [
            { label: 'Master Data', href: '/admin/master', icon: Database },
        ],
    },
    {
        title: 'System',
        collapsible: true,
        items: [
            { label: 'Settings', href: '/admin/settings', icon: Settings },
            { label: 'Branding', href: '/admin/settings/branding', icon: Palette },
            { label: 'Templates', href: '/admin/templates', icon: FileText },
            { label: 'Notifications', href: '/admin/notifications', icon: Bell },
            { label: 'Integrations', href: '/admin/integrations', icon: Plug },
            { label: 'Audit Trail', href: '/admin/audit', icon: Clock },
            { label: 'Reports', href: '/admin/reports', icon: BarChart3 },
            { label: 'Workflows', href: '/admin/workflows', icon: Workflow },
            { label: 'Data Import', href: '/admin/data-import', icon: DatabaseBackup },
            { label: 'Branches', href: '/admin/branches', icon: GitBranch },
            { label: 'API Documentation', href: '/admin/api-docs', icon: BookOpen },
            { label: 'MFA Setup', href: '/admin/mfa-setup', icon: Lock },
            { label: 'Registration Config', href: '/admin/registration-config', icon: SlidersHorizontal },
        ],
    },
];

/** Flat map of href → label for breadcrumb generation */
export const ADMIN_NAV_LABEL_MAP: Record<string, string> = Object.fromEntries(
    ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((item) => [item.href, item.label]))
);
