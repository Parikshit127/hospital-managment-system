'use server';

import { prisma } from '@/backend/db';

function generateToken(): string {
    return `assess-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export async function startAssessment(organizationId: string) {
    try {
        const sessionToken = generateToken();

        await prisma.aiHealthAssessment.create({
            data: {
                organizationId,
                session_token: sessionToken,
                status: 'in_progress',
            },
        });

        return { success: true, data: { sessionToken } };
    } catch (error) {
        console.error('Start assessment error:', error);
        return { success: false, error: 'Failed to start assessment' };
    }
}

export async function submitAssessmentStep(
    sessionToken: string,
    stepData: { question: string; answer: string }
) {
    try {
        const assessment = await prisma.aiHealthAssessment.findUnique({
            where: { session_token: sessionToken },
        });

        if (!assessment) return { success: false, error: 'Session not found' };

        const existingResponses = assessment.responses
            ? JSON.parse(assessment.responses)
            : [];

        existingResponses.push(stepData);

        await prisma.aiHealthAssessment.update({
            where: { session_token: sessionToken },
            data: {
                responses: JSON.stringify(existingResponses),
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Submit step error:', error);
        return { success: false, error: 'Failed to save response' };
    }
}

export async function completeAssessment(sessionToken: string) {
    try {
        const assessment = await prisma.aiHealthAssessment.findUnique({
            where: { session_token: sessionToken },
        });

        if (!assessment) return { success: false, error: 'Session not found' };

        const responses = assessment.responses
            ? JSON.parse(assessment.responses)
            : [];

        // Build AI summary
        let aiSummary: string;
        let riskLevel: string;
        let recommendedTests: string[];
        let recommendedSpecialties: string[];

        try {
            const aiResult = await generateAISummary(responses);
            aiSummary = aiResult.summary;
            riskLevel = aiResult.riskLevel;
            recommendedTests = aiResult.tests;
            recommendedSpecialties = aiResult.specialties;
        } catch {
            // Fallback without AI
            const fallback = generateFallbackSummary(responses);
            aiSummary = fallback.summary;
            riskLevel = fallback.riskLevel;
            recommendedTests = fallback.tests;
            recommendedSpecialties = fallback.specialties;
        }

        await prisma.aiHealthAssessment.update({
            where: { session_token: sessionToken },
            data: {
                status: 'completed',
                ai_summary: aiSummary,
                risk_level: riskLevel,
                recommended_tests: JSON.stringify(recommendedTests),
                recommended_specialties: JSON.stringify(recommendedSpecialties),
            },
        });

        return {
            success: true,
            data: {
                summary: aiSummary,
                riskLevel,
                recommendedTests,
                recommendedSpecialties,
            },
        };
    } catch (error) {
        console.error('Complete assessment error:', error);
        return { success: false, error: 'Failed to complete assessment' };
    }
}

export async function getAssessmentResult(sessionToken: string) {
    try {
        const assessment = await prisma.aiHealthAssessment.findUnique({
            where: { session_token: sessionToken },
            include: { organization: { select: { name: true, slug: true, phone: true } } },
        });

        if (!assessment) return { success: false, error: 'Not found' };

        return {
            success: true,
            data: {
                status: assessment.status,
                summary: assessment.ai_summary,
                riskLevel: assessment.risk_level,
                recommendedTests: assessment.recommended_tests ? JSON.parse(assessment.recommended_tests) : [],
                recommendedSpecialties: assessment.recommended_specialties ? JSON.parse(assessment.recommended_specialties) : [],
                responses: assessment.responses ? JSON.parse(assessment.responses) : [],
                hospitalName: assessment.organization.name,
                hospitalPhone: assessment.organization.phone,
            },
        };
    } catch (error) {
        console.error('Get result error:', error);
        return { success: false, error: 'Failed to retrieve results' };
    }
}

// ——— AI / Fallback logic ———

async function generateAISummary(responses: Array<{ question: string; answer: string }>) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('No API key');

    const formatted = responses.map(r => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are a medical screening assistant. Based on patient self-reported symptoms, provide:
1. A brief health summary (2-3 sentences)
2. Risk level: LOW, MODERATE, HIGH, or CRITICAL
3. Recommended diagnostic tests (array of strings)
4. Recommended medical specialties to consult (array of strings)

Return ONLY valid JSON with keys: summary, riskLevel, tests, specialties.
Do not include markdown or code blocks.
This is a screening tool, not a diagnosis. Always recommend professional consultation.`,
                },
                { role: 'user', content: formatted },
            ],
            temperature: 0.3,
            max_tokens: 800,
        }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
}

function generateFallbackSummary(responses: Array<{ question: string; answer: string }>) {
    const symptomAnswers = responses
        .filter(r => r.question.toLowerCase().includes('symptom') || r.question.toLowerCase().includes('how long'))
        .map(r => r.answer);

    const hasHighSeverity = responses.some(r =>
        r.answer.toLowerCase().includes('severe') ||
        r.answer.toLowerCase().includes('chest pain') ||
        r.answer.toLowerCase().includes('breathing')
    );

    return {
        summary: `Based on your responses, you reported ${symptomAnswers.length > 0 ? symptomAnswers.join(', ') : 'various symptoms'}. We recommend consulting a medical professional for a thorough evaluation.`,
        riskLevel: hasHighSeverity ? 'HIGH' : 'MODERATE',
        tests: ['Complete Blood Count (CBC)', 'Basic Metabolic Panel'],
        specialties: ['General Medicine'],
    };
}
