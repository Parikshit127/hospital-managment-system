import { NextRequest, NextResponse } from 'next/server';
import { validateZealthixApiKey, logZealthixApiCall } from '@/app/lib/zealthix/auth';
import { getVisitDocuments } from '@/app/lib/zealthix/document-fetcher';

export async function POST(request: NextRequest) {
    const authResult = await validateZealthixApiKey(request);
    if (authResult instanceof NextResponse) return authResult;

    const { organizationId, apiKeyId } = authResult;
    let body: Record<string, unknown> = {};

    try {
        body = await request.json();
        const { visitId, visitType } = body as {
            visitId?: string;
            visitDateTime?: string;
            visitType?: string;
        };

        if (!visitId) {
            await logZealthixApiCall(organizationId, apiKeyId, '/claim/visit/documents', body, 400);
            return NextResponse.json(
                { success: false, message: 'visitId is required' },
                { status: 400 }
            );
        }

        // Determine the base URL for internal PDF generation
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const host = request.headers.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        // Get the API key from the request header
        const apiKey = request.headers.get('X-Api-Key') || '';

        const documents = await getVisitDocuments(
            visitId,
            visitType || 'INPATIENT',
            organizationId,
            baseUrl,
            apiKey
        );

        await logZealthixApiCall(organizationId, apiKeyId, '/claim/visit/documents', body, 200);

        return NextResponse.json({
            success: true,
            message: 'success',
            data: { documents },
        });
    } catch (error) {
        console.error('Zealthix visit documents error:', error);
        await logZealthixApiCall(organizationId, apiKeyId, '/claim/visit/documents', body, 500);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
