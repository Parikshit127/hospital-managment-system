import { PageSkeleton } from '@/app/components/PageSkeleton';

export default function ReceptionLoading() {
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header skeleton */}
                <div className="mb-8 space-y-2">
                    <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
                    <div className="h-4 w-72 bg-gray-200 rounded-lg animate-pulse" />
                </div>
                <PageSkeleton type="dashboard" />
            </div>
        </div>
    );
}
