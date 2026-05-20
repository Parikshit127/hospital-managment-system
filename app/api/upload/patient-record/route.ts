import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, buildPatientRecordKey, getSignedDownloadUrl } from '@/app/lib/s3';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

        // Validate file size (max 10 MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Get org ID from form data or default
        const orgId = formData.get('organizationId') as string || 'default';
        const patientId = formData.get('patientId') as string || undefined;

        // Upload to S3
        const key = buildPatientRecordKey(orgId, file.name, patientId);
        await uploadToS3(buffer, key, file.type);

        // Return the S3 key (frontend will use /api/files/[key] to get a signed URL)
        return NextResponse.json({ key, fileName: file.name });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
