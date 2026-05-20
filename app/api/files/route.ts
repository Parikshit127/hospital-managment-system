import { NextRequest, NextResponse } from 'next/server';
import { getSignedDownloadUrl } from '@/app/lib/s3';

/**
 * GET /api/files?key=patient-records/org123/abc.pdf
 * Returns a temporary signed URL (1 hour) for downloading the file from S3
 */
export async function GET(req: NextRequest) {
    try {
        const key = req.nextUrl.searchParams.get('key');
        if (!key) {
            return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
        }

        // Security: only allow access to patient-records prefix
        if (!key.startsWith('patient-records/')) {
            return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
        }

        const url = await getSignedDownloadUrl(key, 3600); // 1 hour expiry
        return NextResponse.json({ url });
    } catch (error) {
        console.error('File access error:', error);
        return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }
}
