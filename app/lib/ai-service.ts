/**
 * AI Service Layer — abstraction for OpenAI GPT-4o calls with fallback
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

function getOpenAIKey(): string | null {
    return process.env.OPENAI_API_KEY || null;
}

async function callGPT(systemPrompt: string, userPrompt: string, model = 'gpt-4o'): Promise<string> {
    const apiKey = getOpenAIKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// ========================================
// SOAP Note Generation
// ========================================

export async function generateSOAPNote(
    rawText: string,
    patientContext: {
        name: string;
        age?: number;
        gender?: string;
        chiefComplaint?: string;
        vitals?: Record<string, string>;
        history?: string;
    }
): Promise<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
}> {
    const apiKey = getOpenAIKey();

    if (!apiKey) {
        return fallbackSOAPFormat(rawText);
    }

    const vitalsStr = patientContext.vitals
        ? Object.entries(patientContext.vitals).map(([k, v]) => `${k}: ${v}`).join(', ')
        : 'Not recorded';

    const systemPrompt = `You are a medical documentation assistant helping doctors write SOAP notes.
Format the doctor's rough notes into a professional SOAP note structure.
Use proper medical terminology. Be concise but thorough.
Return ONLY a JSON object with these exact keys: subjective, objective, assessment, plan.
Each value should be a string with the formatted content for that section.
Do not include any markdown or code blocks in the response.`;

    const userPrompt = `Patient: ${patientContext.name}, ${patientContext.age || 'unknown'}y/${patientContext.gender || 'unknown'}
Chief Complaint: ${patientContext.chiefComplaint || 'See notes'}
Vitals: ${vitalsStr}
History: ${patientContext.history || 'None available'}

Doctor's raw notes:
${rawText}

Format into SOAP note JSON:`;

    try {
        const result = await callGPT(systemPrompt, userPrompt);
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            subjective: parsed.subjective || '',
            objective: parsed.objective || '',
            assessment: parsed.assessment || '',
            plan: parsed.plan || '',
        };
    } catch (error) {
        console.error('[AI-Service] SOAP generation failed, using fallback:', error);
        return fallbackSOAPFormat(rawText);
    }
}

function fallbackSOAPFormat(rawText: string): {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
} {
    const lines = rawText.split('\n').filter(l => l.trim());
    const mid = Math.ceil(lines.length / 2);

    return {
        subjective: lines.slice(0, Math.ceil(mid / 2)).join('\n') || rawText,
        objective: 'See vitals and examination findings.',
        assessment: lines.slice(Math.ceil(mid / 2), mid).join('\n') || 'Pending clinical assessment.',
        plan: lines.slice(mid).join('\n') || 'Continue workup as indicated.',
    };
}

// ========================================
// ICD-10 Auto-coding
// ========================================

export async function autoCodeICD10(diagnosisText: string): Promise<
    Array<{ code: string; description: string; confidence: number }>
> {
    const apiKey = getOpenAIKey();
    if (!apiKey || !diagnosisText.trim()) {
        return [];
    }

    const systemPrompt = `You are a medical coding assistant. Given a clinical diagnosis or assessment text, suggest the top 5 most relevant ICD-10 codes.
Return ONLY a JSON array where each element has: code (string), description (string), confidence (number 0-1).
Do not include markdown or code blocks.`;

    try {
        const result = await callGPT(systemPrompt, `Diagnosis: ${diagnosisText}`);
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed)
            ? parsed.slice(0, 5).map((item: any) => ({
                code: item.code || '',
                description: item.description || '',
                confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
            }))
            : [];
    } catch (error) {
        console.error('[AI-Service] ICD-10 coding failed:', error);
        return [];
    }
}

// ========================================
// Pre-consultation Brief
// ========================================

export async function generatePreConsultBrief(
    patientData: {
        name: string;
        age?: number;
        gender?: string;
        recentVisits: Array<{ date: string; diagnosis: string; notes: string }>;
        pendingLabs: Array<{ testType: string; status: string; result?: string }>;
        currentMeds: string[];
    }
): Promise<string> {
    const apiKey = getOpenAIKey();

    const visitSummary = patientData.recentVisits.length > 0
        ? patientData.recentVisits.map(v => `- ${v.date}: ${v.diagnosis} (${v.notes.substring(0, 100)})`).join('\n')
        : 'No recent visits.';

    const labSummary = patientData.pendingLabs.length > 0
        ? patientData.pendingLabs.map(l => `- ${l.testType}: ${l.status}${l.result ? ` → ${l.result}` : ''}`).join('\n')
        : 'No pending labs.';

    if (!apiKey) {
        return `**Patient:** ${patientData.name}, ${patientData.age || '?'}y/${patientData.gender || '?'}\n\n**Recent Visits:**\n${visitSummary}\n\n**Labs:**\n${labSummary}\n\n**Current Medications:** ${patientData.currentMeds.join(', ') || 'None'}`;
    }

    const systemPrompt = `You are a clinical assistant preparing a brief pre-consultation summary for a doctor. Be concise, highlight key concerns, flag any drug interactions or abnormal results. Use plain text with markdown bold for headers.`;

    const userPrompt = `Patient: ${patientData.name}, ${patientData.age}y/${patientData.gender}

Recent Visits:
${visitSummary}

Lab Results:
${labSummary}

Current Medications: ${patientData.currentMeds.join(', ') || 'None'}

Provide a concise pre-consultation brief:`;

    try {
        return await callGPT(systemPrompt, userPrompt);
    } catch (error) {
        console.error('[AI-Service] Pre-consult brief failed:', error);
        return `**Patient:** ${patientData.name}, ${patientData.age || '?'}y/${patientData.gender || '?'}\n\n**Recent Visits:**\n${visitSummary}\n\n**Labs:**\n${labSummary}`;
    }
}

// ========================================
// Audio Transcription (Whisper)
// ========================================

export async function transcribeAudio(audioBuffer: Buffer, filename: string = 'audio.webm'): Promise<string> {
    const apiKey = getOpenAIKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('prompt', 'Medical consultation notes. Patient symptoms, diagnosis, treatment plan.');

    const response = await fetch(WHISPER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Whisper API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.text || '';
}
