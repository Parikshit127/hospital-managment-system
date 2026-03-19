import { z } from 'zod';

export const patientFeedbackSchema = z.object({
    rating: z
        .number()
        .int()
        .min(1, 'Rating must be at least 1')
        .max(5, 'Rating cannot exceed 5'),
    comments: z
        .string()
        .max(2000, 'Comments must be under 2000 characters')
        .optional()
        .or(z.literal('')),
});

export type PatientFeedbackInput = z.infer<typeof patientFeedbackSchema>;

export const patientPasswordSetupSchema = z.object({
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password must be under 100 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

export type PatientPasswordSetupInput = z.infer<typeof patientPasswordSetupSchema>;
