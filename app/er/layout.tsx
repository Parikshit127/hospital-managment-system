// Portal pages render their own AppShell/Sidebar (which is portal-aware for
// admins via the path), so this layout is a simple pass-through. Admins now
// see the ER sidebar here instead of the admin shell.
export default function ERLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
