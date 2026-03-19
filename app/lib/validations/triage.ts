import { z } from 'zod';

export const triageVitalsSchema = z.object({
    bloodPressure: z
        .string()
        .regex(/^\d{2,3}\/\d{2,3}$/, 'BP must be in format like 120/80')
        .optional()
        .or(z.literal('')),
    heartRate: z
        .number()
        .int()
        .min(30, 'Heart rate must be at least 30 bpm')
        .max(250, 'Heart rate cannot exceed 250 bpm')
        .optional(),
    temperature: z
        .number()
        .min(32, 'Temperature must be at least 32°C')
        .max(43, 'Temperature cannot exceed 43°C')
        .optional(),
    oxygenSat: z
        .number()
        .int()
        .min(50, 'SpO2 must be at least 50%')
        .max(100, 'SpO2 cannot exceed 100%')
        .optional(),
});

export const triageInputSchema = z.object({
    patientName: z
        .string()
        .min(2, 'Patient name must be at least 2 characters')
        .max(100),
    patientId: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    symptoms: z
        .array(z.string().min(1))
        .min(1, 'At least one symptom is required'),
    duration: z.string().max(100).optional().or(z.literal('')),
    severity: z.enum(['Mild', 'Moderate', 'Severe'], {
        error: 'Select a severity level',
    }),
    pastMedicalHistory: z.string().max(1000).optional().or(z.literal('')),
    currentMedications: z.string().max(500).optional().or(z.literal('')),
    allergies: z.string().max(500).optional().or(z.literal('')),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.string().optional(),
    vitals: triageVitalsSchema.optional(),
});

export type TriageInputValidated = z.infer<typeof triageInputSchema>;
