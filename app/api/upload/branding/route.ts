import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/app/lib/s3';
import { requireRoleAndTenant } from '@/backend/tenant';

export async function POST(req: NextRequest) {
    try {
        const { organizationId } = await requireRoleAndTenant(['admin']);

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const type = (formData.get('type') as string) || 'logo'; // 'logo' | 'letterhead'

        if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop() || 'png';
        const key = `branding/${organizationId}/${type}-${Date.now()}.${ext}`;

        await uploadToS3(buffer, key, file.type);

        return NextResponse.json({ key, fileName: file.name });
    } catch (error: any) {
        console.error('Branding upload error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
