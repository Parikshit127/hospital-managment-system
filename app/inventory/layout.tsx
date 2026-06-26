import { InventoryAccessGuard } from './components/InventoryAccessGuard';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <InventoryAccessGuard>{children}</InventoryAccessGuard>;
}
