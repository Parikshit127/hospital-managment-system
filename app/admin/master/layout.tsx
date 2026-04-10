import { AdminPage } from '@/app/admin/components/AdminPage';
import { Database } from 'lucide-react';
import Link from 'next/link';

const TABS = [
  { href: '/admin/master/doctors',  label: 'Doctor Master'   },
  { href: '/admin/master/services', label: 'Service Master'  },
  { href: '/admin/master/medicines', label: 'Medicine Master' },
];

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminPage pageTitle="Master Data" pageIcon={<Database className="h-5 w-5" />}>
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 text-sm font-semibold text-gray-600 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </AdminPage>
  );
}
