'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/master/doctors', label: 'Doctor Master' },
  { href: '/admin/master/services', label: 'Service Master' },
  { href: '/admin/master/medicines', label: 'Medicine Master' },
];

export function MasterTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {TABS.map(t => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            pathname.startsWith(t.href)
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-blue-600 hover:border-blue-300'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
