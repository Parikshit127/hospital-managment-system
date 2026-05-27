import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/app/lib/s3';

function buildExpenseReceiptKey(orgId: string, fileName: string): string {
    const ext = fileName.split('.').pop() || 'pdf';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    return `expense-receipts/${orgId}/${uniqueName}`;
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
        }

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, JPEG, PNG, WebP' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const orgId = formData.get('organizationId') as string || 'default';

        const key = buildExpenseReceiptKey(orgId, file.name);
        await uploadToS3(buffer, key, file.type);

        return NextResponse.json({ key, fileName: file.name });
    } catch (error) {
        console.error('Expense receipt upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
