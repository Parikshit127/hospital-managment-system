// Portal pages render their own AppShell/Sidebar (which is portal-aware for
// admins via the path), so this layout is a simple pass-through. Admins now
// see the OT sidebar here instead of the admin shell.
export default function OTLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
