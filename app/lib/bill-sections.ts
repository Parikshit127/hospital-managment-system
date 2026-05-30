import { prisma } from '@/backend/db';

export interface BillSections {
    showHeader: boolean;
    showPatientInfo: boolean;
    showLineItems: boolean;
    showGstSummary: boolean;
    showPaymentHistory: boolean;
    showAmountInWords: boolean;
    showSignature: boolean;
    showFooter: boolean;
    showTerms: boolean;
}

const DEFAULT_SECTIONS: BillSections = {
    showHeader: true,
    showPatientInfo: true,
    showLineItems: true,
    showGstSummary: true,
    showPaymentHistory: true,
    showAmountInWords: true,
    showSignature: true,
    showFooter: true,
    showTerms: true,
};

const SECTION_ID_MAP: Record<string, keyof BillSections> = {
    header: 'showHeader',
    patient: 'showPatientInfo',
    items: 'showLineItems',
    totals: 'showLineItems',
    gst_summary: 'showGstSummary',
    payment: 'showPaymentHistory',
    amount_words: 'showAmountInWords',
    signatures: 'showSignature',
    footer: 'showFooter',
    terms: 'showTerms',
    instructions: 'showFooter',
};

export async function getBillSections(
    organizationId: string,
    type: string,
): Promise<BillSections> {
    try {
        const template = await prisma.documentTemplate.findFirst({
            where: {
                organizationId,
                type,
                is_default: true,
                is_active: true,
            },
        });

        if (!template) return { ...DEFAULT_SECTIONS };

        const content = template.content_json as any;
        const sections = content?.sections;
        if (!Array.isArray(sections)) return { ...DEFAULT_SECTIONS };

        const result = { ...DEFAULT_SECTIONS };
        for (const section of sections) {
            const key = SECTION_ID_MAP[section.id];
            if (key && typeof section.enabled === 'boolean') {
                result[key] = section.enabled;
            }
        }

        return result;
    } catch {
        return { ...DEFAULT_SECTIONS };
    }
}
