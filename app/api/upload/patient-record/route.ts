import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadDir = path.join(process.cwd(), 'public', 'patient-records');
        await mkdir(uploadDir, { recursive: true });

        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = path.join(uploadDir, fileName);

        await writeFile(filePath, buffer);

        return NextResponse.json({ url: `/patient-records/${fileName}` });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
