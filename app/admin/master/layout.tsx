import { AdminPage } from '@/app/admin/components/AdminPage';
import { Database } from 'lucide-react';
import { MasterTabs } from './MasterTabs';

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminPage pageTitle="Master Data" pageIcon={<Database className="h-5 w-5" />}>
      <MasterTabs />
      {children}
    </AdminPage>
  );
}
