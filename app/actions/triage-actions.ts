'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { sendWelcomeEmail } from '@/backend/email';
import { createPatientPasswordSetupToken } from '@/app/lib/password-setup';

// Generate unique IDs
function generatePatientId(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PAT-${y}${m}${d}-${rand}`;
}

function generateAppointmentId(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `APP-${y}${m}${d}-${rand}`;
}

// =========================================
// Type Definitions
// =========================================

type TriageInput = {
    patientName: string;
    patientId?: string;
    phone?: string;
    email?: string;
    symptoms: string[];
    duration: string;
    severity: string; // Mild, Moderate, Severe
    pastMedicalHistory: string;
    currentMedications: string;
    allergies: string;
    age?: number;
    gender?: string;
    vitals?: {
        bloodPressure?: string;
        heartRate?: number;
        temperature?: number;
        oxygenSat?: number;
    };
};

type TriageOutput = {
    triageLevel: 'Emergency' | 'Urgent' | 'Routine';
    recommendedDepartment: string;
    possibleConditions: string[];
    recommendedTests: string[];
    riskAlerts: string[];
    clinicalSummary: string;
    aiPowered: boolean; // true if Gemini was used, false for rule-based fallback
};

// =========================================
// OpenAI GPT Triage Engine
// =========================================

async function runOpenAITriage(input: TriageInput): Promise<TriageOutput | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
        return null; // Fall back to rule-based engine
    }

    const systemPrompt = `You are a senior clinical triage physician AI with 20+ years of emergency medicine and internal medicine experience. You are performing a comprehensive patient assessment for a hospital's clinical decision support system. Your assessment will be reviewed by attending physicians — so it must be thorough, clinically accurate, and written with professional medical terminology while remaining clear and actionable.

You MUST respond ONLY with valid JSON — no markdown wrapping, no code blocks, no extra text outside the JSON.`;

    const userPrompt = `Perform a comprehensive clinical triage assessment for this patient:

═══════════════════════════════════════
PATIENT DEMOGRAPHICS:
  • Full Name: ${input.patientName}
  • Age: ${input.age || 'Not provided'} years
  • Sex: ${input.gender || 'Not provided'}

PRESENTING COMPLAINTS:
  • Chief Complaints: ${input.symptoms.join('; ')}
  • Duration: ${input.duration || 'Not specified'}
  • Patient-Reported Severity: ${input.severity}

MEDICAL HISTORY:
  • Past Medical History: ${input.pastMedicalHistory || 'None reported'}
  • Current Medications: ${input.currentMedications || 'None reported'}
  • Known Drug Allergies: ${input.allergies || 'NKDA (No Known Drug Allergies)'}
${input.vitals ? `
VITAL SIGNS (Recorded at Triage):
  • Blood Pressure: ${input.vitals.bloodPressure || 'Not recorded'}
  • Heart Rate: ${input.vitals.heartRate || 'Not recorded'} bpm
  • Body Temperature: ${input.vitals.temperature || 'Not recorded'}°C
  • Oxygen Saturation (SpO2): ${input.vitals.oxygenSat || 'Not recorded'}%` : `
VITAL SIGNS: Pending — not yet recorded at triage`}
═══════════════════════════════════════

Return your assessment as JSON with this EXACT structure:
{
    "triageLevel": "Emergency" or "Urgent" or "Routine",
    "recommendedDepartment": "The most appropriate clinical department (e.g., Emergency Department, Cardiology, Neurology, General Medicine, Orthopedics, Pulmonology, Gastroenterology, etc.)",
    "possibleConditions": ["List 4-6 differential diagnoses ranked from most to least likely, be specific with medical terminology"],
    "recommendedTests": ["List 4-8 specific diagnostic investigations needed, include both stat and routine tests"],
    "riskAlerts": ["List all clinical red flags. Start each with: 🚨 for life-threatening, ⚠️ for significant concern, 💊 for drug/allergy related, 👴 for age-related risk"],
    "clinicalSummary": "Write a comprehensive, professional clinical assessment in this exact format using line breaks (\\n):\\n\\nSUBJECTIVE:\\nWrite 3-4 sentences about the patient's presentation, history of presenting illness (HPI), and relevant review of systems. Include onset, character, duration, and aggravating/relieving factors.\\n\\nOBJECTIVE:\\nSummarize all available vital signs, their interpretation (normal/abnormal), and note what physical examination findings should be assessed.\\n\\nASSESSMENT:\\nProvide your clinical impression — the most likely diagnosis, key differential diagnoses, severity assessment, and clinical reasoning for the triage level. Explain WHY you've chosen this triage level.\\n\\nPLAN:\\nList specific, actionable next steps: immediate interventions needed, diagnostic workup, specialist consultations, monitoring parameters, and disposition recommendations.\\n\\nIMMEDIATE ACTIONS:\\nList 2-4 things that need to happen RIGHT NOW (e.g., 'Establish IV access', 'Continuous cardiac monitoring', 'Administer oxygen via nasal cannula').\\n\\nCLINICAL REASONING:\\nIn 2-3 sentences, explain your clinical thinking — why certain diagnoses are more likely, what findings would confirm or rule them out, and what the attending physician should watch for."
}

CLINICAL RULES (strictly follow):
1. EMERGENCY criteria: chest pain, difficulty breathing, severe bleeding, altered consciousness, SpO2 < 92%, HR > 120 or < 45, systolic BP < 90 or > 200, Temp > 40°C, signs of stroke/MI/PE
2. URGENT criteria: high fever (38.5-40°C), moderate pain, abnormal vitals not meeting emergency criteria, potential surgical conditions
3. Age modifiers: elderly (>65) and pediatric (<5) patients get a one-level bump in urgency
4. ALWAYS flag known allergies prominently in risk alerts
5. Be thorough with differential diagnoses — include both common and dangerous "can't miss" diagnoses
6. Clinical summary must be detailed enough for an attending physician to make informed decisions
7. RESPOND ONLY WITH THE JSON OBJECT.`;


    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            console.error('OpenAI API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;

        if (!text) {
            console.error('No text in OpenAI response');
            return null;
        }

        // Parse the JSON response (handle potential markdown code blocks)
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }

        const parsed = JSON.parse(jsonStr);

        return {
            triageLevel: parsed.triageLevel || 'Routine',
            recommendedDepartment: parsed.recommendedDepartment || 'General Medicine',
            possibleConditions: parsed.possibleConditions || ['Further clinical evaluation needed'],
            recommendedTests: parsed.recommendedTests || ['CBC'],
            riskAlerts: parsed.riskAlerts || [],
            clinicalSummary: parsed.clinicalSummary || 'AI assessment completed. Please review clinical findings.',
            aiPowered: true,
        };
    } catch (error) {
        console.error('OpenAI triage error:', error);
        return null; // Fall back to rule-based
    }
}

// =========================================
// Rule-Based Fallback Triage Engine
// =========================================

// Emergency symptoms red-flag database
const EMERGENCY_SYMPTOMS = [
    'chest pain', 'difficulty breathing', 'severe bleeding', 'unconscious',
    'seizure', 'stroke symptoms', 'severe allergic reaction', 'anaphylaxis',
    'cardiac arrest', 'severe burns', 'drowning', 'poisoning',
    'head injury', 'spinal injury', 'severe trauma', 'choking',
    'heart attack', 'shortness of breath', 'loss of consciousness',
    'high fever above 104', 'severe abdominal pain'
];

const URGENT_SYMPTOMS = [
    'high fever', 'persistent vomiting', 'dehydration', 'broken bone',
    'deep cut', 'moderate bleeding', 'severe headache', 'eye injury',
    'diabetic emergency', 'asthma attack', 'kidney stones',
    'appendicitis', 'blood in urine', 'blood in stool',
    'severe diarrhea', 'abdominal pain', 'back pain severe'
];

// Symptom → Department mapping
const DEPARTMENT_MAP: Record<string, string> = {
    'chest pain': 'Cardiology',
    'heart palpitations': 'Cardiology',
    'heart attack': 'Cardiology',
    'difficulty breathing': 'Pulmonology',
    'asthma attack': 'Pulmonology',
    'shortness of breath': 'Pulmonology',
    'cough': 'Pulmonology',
    'headache': 'Neurology',
    'seizure': 'Neurology',
    'stroke symptoms': 'Neurology',
    'dizziness': 'Neurology',
    'skin rash': 'Dermatology',
    'skin infection': 'Dermatology',
    'joint pain': 'Orthopedics',
    'broken bone': 'Orthopedics',
    'back pain': 'Orthopedics',
    'fracture': 'Orthopedics',
    'abdominal pain': 'Gastroenterology',
    'nausea': 'Gastroenterology',
    'vomiting': 'Gastroenterology',
    'diarrhea': 'Gastroenterology',
    'eye pain': 'Ophthalmology',
    'eye injury': 'Ophthalmology',
    'blurred vision': 'Ophthalmology',
    'ear pain': 'ENT',
    'hearing loss': 'ENT',
    'sore throat': 'ENT',
    'fever': 'General Medicine',
    'fatigue': 'General Medicine',
    'weight loss': 'General Medicine',
    'diabetes': 'Endocrinology',
    'thyroid': 'Endocrinology',
};

// Symptom → Possible conditions
const CONDITION_MAP: Record<string, string[]> = {
    'chest pain': ['Angina', 'Myocardial Infarction', 'Costochondritis', 'GERD'],
    'headache': ['Migraine', 'Tension Headache', 'Sinusitis', 'Cluster Headache'],
    'fever': ['Viral Infection', 'Bacterial Infection', 'Dengue', 'Malaria', 'Typhoid'],
    'abdominal pain': ['Gastritis', 'Appendicitis', 'Kidney Stones', 'IBS'],
    'cough': ['Common Cold', 'Bronchitis', 'Pneumonia', 'Asthma', 'TB'],
    'back pain': ['Muscle Strain', 'Disc Herniation', 'Sciatica', 'Spondylitis'],
    'joint pain': ['Arthritis', 'Gout', 'Rheumatoid Arthritis', 'Lupus'],
    'dizziness': ['Vertigo', 'Hypotension', 'Anemia', 'Inner Ear Infection'],
    'nausea': ['Gastroenteritis', 'Food Poisoning', 'Pregnancy', 'Motion Sickness'],
    'skin rash': ['Contact Dermatitis', 'Eczema', 'Psoriasis', 'Fungal Infection'],
    'difficulty breathing': ['Asthma', 'COPD', 'Pneumonia', 'Pulmonary Embolism'],
    'sore throat': ['Pharyngitis', 'Tonsillitis', 'Strep Throat', 'Mononucleosis'],
};

// Symptom → Recommended tests
const TEST_MAP: Record<string, string[]> = {
    'chest pain': ['ECG', 'Troponin', 'Chest X-Ray', 'CBC'],
    'fever': ['CBC', 'Blood Culture', 'Widal Test', 'Dengue NS1'],
    'abdominal pain': ['Ultrasound Abdomen', 'CBC', 'Liver Function Test', 'Amylase'],
    'headache': ['CT Brain', 'CBC', 'ESR'],
    'cough': ['Chest X-Ray', 'Sputum Culture', 'CBC'],
    'dizziness': ['CBC', 'Blood Sugar', 'ECG', 'Blood Pressure'],
    'joint pain': ['X-Ray', 'Uric Acid', 'RA Factor', 'ESR', 'CRP'],
    'skin rash': ['Skin Scraping', 'CBC', 'IgE Levels'],
    'difficulty breathing': ['Chest X-Ray', 'ABG', 'Spirometry', 'D-Dimer'],
    'back pain': ['X-Ray Spine', 'MRI Spine', 'CBC', 'ESR'],
    'nausea': ['CBC', 'LFT', 'Pregnancy Test', 'Electrolytes'],
    'sore throat': ['Rapid Strep Test', 'Throat Culture', 'CBC'],
};

function runRuleBasedTriage(input: TriageInput): TriageOutput {
    const lowerSymptoms = input.symptoms.map(s => s.toLowerCase().trim());

    // 1. Determine Triage Level
    let triageLevel: 'Emergency' | 'Urgent' | 'Routine' = 'Routine';
    const riskAlerts: string[] = [];

    // Check emergency symptoms
    for (const symptom of lowerSymptoms) {
        if (EMERGENCY_SYMPTOMS.some(es => symptom.includes(es) || es.includes(symptom))) {
            triageLevel = 'Emergency';
            riskAlerts.push(`🚨 CRITICAL: "${symptom}" is a red-flag emergency symptom`);
        }
    }

    // Check urgent symptoms
    if (triageLevel !== 'Emergency') {
        for (const symptom of lowerSymptoms) {
            if (URGENT_SYMPTOMS.some(us => symptom.includes(us) || us.includes(symptom))) {
                triageLevel = 'Urgent';
                riskAlerts.push(`⚠️ URGENT: "${symptom}" requires priority attention`);
            }
        }
    }

    // Severity escalation
    if (input.severity === 'Severe' && triageLevel === 'Routine') {
        triageLevel = 'Urgent';
        riskAlerts.push('⚠️ Patient self-reports SEVERE symptoms');
    }
    if (input.severity === 'Severe' && triageLevel === 'Urgent') {
        triageLevel = 'Emergency';
        riskAlerts.push('🚨 Severe symptom + urgent pattern → escalated to Emergency');
    }

    // Vitals-based escalation
    if (input.vitals) {
        if (input.vitals.oxygenSat && input.vitals.oxygenSat < 90) {
            triageLevel = 'Emergency';
            riskAlerts.push(`🚨 SpO2 ${input.vitals.oxygenSat}% — Critical hypoxemia`);
        }
        if (input.vitals.heartRate && (input.vitals.heartRate > 130 || input.vitals.heartRate < 40)) {
            triageLevel = 'Emergency';
            riskAlerts.push(`🚨 Heart Rate ${input.vitals.heartRate} BPM — Abnormal cardiac rhythm`);
        }
        if (input.vitals.temperature && input.vitals.temperature > 40) {
            triageLevel = 'Emergency';
            riskAlerts.push(`🚨 Temperature ${input.vitals.temperature}°C — Hyperpyrexia`);
        }
    }

    // Age risk alerts
    if (input.age && input.age > 65) {
        riskAlerts.push('⚠️ Patient is above 65 — increased complication risk');
    }
    if (input.age && input.age < 5) {
        riskAlerts.push('⚠️ Pediatric patient — requires specialized assessment');
    }

    // Drug allergy warnings
    if (input.allergies && input.allergies.trim().length > 0) {
        riskAlerts.push(`💊 Known allergies: ${input.allergies} — review before prescribing`);
    }

    // 2. Determine Department
    let recommendedDepartment = 'General Medicine';
    for (const symptom of lowerSymptoms) {
        for (const [key, dept] of Object.entries(DEPARTMENT_MAP)) {
            if (symptom.includes(key) || key.includes(symptom)) {
                recommendedDepartment = dept;
                break;
            }
        }
    }
    if (triageLevel === 'Emergency') {
        recommendedDepartment = 'Emergency Department';
    }

    // 3. Possible Conditions
    const possibleConditions: Set<string> = new Set();
    for (const symptom of lowerSymptoms) {
        for (const [key, conditions] of Object.entries(CONDITION_MAP)) {
            if (symptom.includes(key) || key.includes(symptom)) {
                conditions.forEach(c => possibleConditions.add(c));
            }
        }
    }
    if (possibleConditions.size === 0) {
        possibleConditions.add('Further clinical evaluation needed');
    }

    // 4. Recommended Tests
    const recommendedTests: Set<string> = new Set();
    for (const symptom of lowerSymptoms) {
        for (const [key, tests] of Object.entries(TEST_MAP)) {
            if (symptom.includes(key) || key.includes(symptom)) {
                tests.forEach(t => recommendedTests.add(t));
            }
        }
    }
    recommendedTests.add('CBC'); // Always recommend CBC

    // 5. Generate SOAP Clinical Summary
    const clinicalSummary = `
SOAP NOTE — AI Triage Assessment
═══════════════════════════════════════

📋 SUBJECTIVE:
Patient ${input.patientName}${input.age ? ` (${input.age}y${input.gender ? '/' + input.gender : ''})` : ''} presents with:
• Chief Complaints: ${input.symptoms.join(', ')}
• Duration: ${input.duration || 'Not specified'}
• Severity: ${input.severity}
• PMH: ${input.pastMedicalHistory || 'None reported'}
• Current Medications: ${input.currentMedications || 'None'}
• Allergies: ${input.allergies || 'NKDA'}

🔬 OBJECTIVE:
${input.vitals ? `• BP: ${input.vitals.bloodPressure || 'N/A'}
• HR: ${input.vitals.heartRate || 'N/A'} BPM
• Temp: ${input.vitals.temperature || 'N/A'}°C
• SpO2: ${input.vitals.oxygenSat || 'N/A'}%` : '• Vitals: Pending assessment'}

📊 ASSESSMENT:
• Triage Level: ${triageLevel.toUpperCase()}
• Department: ${recommendedDepartment}
• Possible Conditions: ${Array.from(possibleConditions).join(', ')}

📝 PLAN:
• Recommended Tests: ${Array.from(recommendedTests).join(', ')}
${riskAlerts.length > 0 ? `\n⚠️ RISK ALERTS:\n${riskAlerts.map(a => `• ${a}`).join('\n')}` : ''}

─────────────────────────────────────
⚕️ This is an AI-assisted triage (rule-based). Final clinical decision rests with the attending physician.
    `.trim();

    return {
        triageLevel,
        recommendedDepartment,
        possibleConditions: Array.from(possibleConditions),
        recommendedTests: Array.from(recommendedTests),
        riskAlerts,
        clinicalSummary,
        aiPowered: false,
    };
}

// =========================================
// Main Triage Engine (Gemini with Fallback)
// =========================================

async function runTriageEngine(input: TriageInput): Promise<TriageOutput> {
    // Try OpenAI GPT first
    const aiResult = await runOpenAITriage(input);
    if (aiResult) {
        return aiResult;
    }
    // Fall back to rule-based engine
    return runRuleBasedTriage(input);
}

// =========================================
// Main Triage Action
// =========================================

export async function performTriage(input: TriageInput) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const result = await runTriageEngine(input);

        // 1. Generate Patient ID & Appointment ID
        const patientId = input.patientId || generatePatientId();
        const appointmentId = generateAppointmentId();

        // 2. Register Patient in OPD_REG (if not already existing)
        let existingPatient = null;
        if (input.patientId) {
            existingPatient = await db.oPD_REG.findUnique({
                where: { patient_id: input.patientId }
            });
        }

        let setupLink: string | null = null;
        if (!existingPatient) {
            await db.oPD_REG.create({
                data: {
                    patient_id: patientId,
                    full_name: input.patientName,
                    age: input.age ? String(input.age) : null,
                    gender: input.gender || null,
                    phone: input.phone || null,
                    email: input.email || null, // Allow email tracking from triage if extended later
                    department: result.recommendedDepartment,
                    address: 'Not provided',
                    password: null,
                },
            });

            const tokenResult = await createPatientPasswordSetupToken({
                patientId,
                organizationId,
            });
            setupLink = tokenResult.setupLink;

            // Send Welcome Email if patient provided one implicitly (or via Reception flow passing down)
            if (input.email) {
                await sendWelcomeEmail(input.email, input.patientName, patientId, setupLink);
            }
        }

        // 3. Auto-Assign Doctor based on Department
        const matchingDoctor = await db.user.findFirst({
            where: {
                role: 'doctor',
                specialty: result.recommendedDepartment,
                is_active: true
            }
        });

        // 4. Create Appointment (Patient shows in Doctor's Queue)
        await db.appointments.create({
            data: {
                appointment_id: appointmentId,
                patient_id: patientId,
                status: 'Pending',
                department: result.recommendedDepartment,
                doctor_id: matchingDoctor ? matchingDoctor.id : null,
                doctor_name: matchingDoctor ? matchingDoctor.name || matchingDoctor.username : null,
                reason_for_visit: `AI Triage: ${input.symptoms.slice(0, 3).join(', ')}${input.symptoms.length > 3 ? '...' : ''} | Level: ${result.triageLevel}`,
            }
        });

        // 4. Save Vitals (if provided)
        if (input.vitals && (input.vitals.bloodPressure || input.vitals.heartRate || input.vitals.temperature || input.vitals.oxygenSat)) {
            await db.vital_signs.create({
                data: {
                    patient_id: patientId,
                    appointment_id: appointmentId,
                    blood_pressure: input.vitals.bloodPressure || null,
                    heart_rate: input.vitals.heartRate || null,
                    temperature: input.vitals.temperature || null,
                    oxygen_sat: input.vitals.oxygenSat || null,
                    recorded_by: 'AI Triage System',
                }
            });
        }

        // 5. Save Triage Results
        await db.triage_results.create({
            data: {
                patient_id: patientId,
                patient_name: input.patientName,
                symptoms: JSON.stringify(input.symptoms),
                duration: input.duration,
                severity: input.severity,
                past_medical_history: input.pastMedicalHistory,
                current_medications: input.currentMedications,
                allergies: input.allergies,
                triage_level: result.triageLevel,
                recommended_department: result.recommendedDepartment,
                possible_conditions: JSON.stringify(result.possibleConditions),
                recommended_tests: JSON.stringify(result.recommendedTests),
                risk_alerts: JSON.stringify(result.riskAlerts),
                clinical_summary: result.clinicalSummary,
            }
        });

        // 6. Log audit
        await db.system_audit_logs.create({
            data: {
                action: 'AI_TRIAGE',
                module: 'reception',
                entity_type: 'triage',
                entity_id: patientId,
                details: JSON.stringify({
                    patientName: input.patientName,
                    patientId: patientId,
                    appointmentId: appointmentId,
                    triageLevel: result.triageLevel,
                    department: result.recommendedDepartment,
                    symptoms: input.symptoms,
                    aiPowered: result.aiPowered,
                }),
            }
        });

        // Revalidate doctor dashboard so patient appears in queue
        revalidatePath('/doctor/dashboard');

        return {
            success: true,
            data: {
                ...result,
                patientId,
                appointmentId,
                passwordSetupRequired: !!setupLink,
                manualPasswordSetupLink: input.email ? null : setupLink,
            },
        };
    } catch (error: any) {
        console.error('performTriage error:', error);
        return { success: false, error: error.message };
    }
}

// =========================================
// Get Triage Data for Doctor Dashboard
// =========================================

export async function getPatientTriageData(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        // Fetch latest triage result for this patient
        const triageResult = await db.triage_results.findFirst({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });

        // Fetch latest vitals
        const vitals = await db.vital_signs.findFirst({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });

        if (!triageResult) {
            return { success: true, data: null };
        }

        return {
            success: true,
            data: {
                // Triage Info
                triageLevel: triageResult.triage_level,
                recommendedDepartment: triageResult.recommended_department,
                symptoms: safeJsonParse(triageResult.symptoms, []),
                duration: triageResult.duration,
                severity: triageResult.severity,
                possibleConditions: safeJsonParse(triageResult.possible_conditions, []),
                recommendedTests: safeJsonParse(triageResult.recommended_tests, []),
                riskAlerts: safeJsonParse(triageResult.risk_alerts, []),
                clinicalSummary: triageResult.clinical_summary,
                pastMedicalHistory: triageResult.past_medical_history,
                currentMedications: triageResult.current_medications,
                allergies: triageResult.allergies,
                triageDate: triageResult.created_at,
                // Vitals
                vitals: vitals ? {
                    bloodPressure: vitals.blood_pressure,
                    heartRate: vitals.heart_rate,
                    temperature: vitals.temperature,
                    oxygenSat: vitals.oxygen_sat,
                    respiratoryRate: vitals.respiratory_rate,
                    recordedBy: vitals.recorded_by,
                } : null,
            },
        };
    } catch (error: any) {
        console.error('getPatientTriageData error:', error);
        return { success: false, error: error.message };
    }
}

function safeJsonParse(val: string | null, fallback: any) {
    if (!val) return fallback;
    try { return JSON.parse(val); } catch { return fallback; }
}

// Get triage history
export async function getTriageHistory(limit: number = 20) {
    try {
        const { db } = await requireTenantContext();
        const results = await db.triage_results.findMany({
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        return { success: true, data: results };
    } catch (error: any) {
        console.error('getTriageHistory error:', error);
        return { success: false, error: error.message };
    }
}
