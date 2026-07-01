import { LoadingState } from '@/app/components/ui/LoadingState';

export default function HelpCenterLoading() {
    return (
        <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 lg:px-8">
            <LoadingState message="Loading Help Center…" />
        </main>
    );
}
