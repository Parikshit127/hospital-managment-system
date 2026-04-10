import { z } from 'zod';

// Indian phone: 10 digits starting with 6-9, optional +91 prefix
const phoneRegex = /^(\+91)?[6-9]\d{9}$/;

// Aadhaar: 12 digits (Verhoeff checksum optional, just structural validation here)
const aadhaarRegex = /^\d{12}$/;

export const patientRegistrationSchema = z.object({
    full_name: z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must be under 100 characters')
        .regex(/^[^0-9]*$/, 'Name cannot contain numbers')
        .transform(val => val.trim()),
    phone: z
        .string()
        .transform(val => val.replace(/^\+91/, '').replace(/[\s\-]/g, '').slice(-10))
        .refine(val => phoneRegex.test(val), {
            message: 'Phone must be 10 digits starting with 6-9',
        }),
    age: z
        .string()
        .refine(val => {
            const n = parseInt(val, 10);
            return !isNaN(n) && n >= 0 && n <= 120;
        }, { message: 'Age must be between 0 and 120' }),
    gender: z.enum(['Male', 'Female', 'Other'], {
        error: 'Select a valid gender',
    }),
    department: z.string().min(1, 'Department is required'),
    email: z
        .string()
        .email('Enter a valid email address')
        .optional()
        .or(z.literal('')),
    address: z
        .string()
        .min(10, 'Address must be at least 10 characters')
        .max(500, 'Address must be under 500 characters')
        .optional()
        .or(z.literal('')),
    aadhar: z
        .string()
        .transform(val => val.replace(/[-\s]/g, ''))
        .refine(val => val === '' || aadhaarRegex.test(val), {
            message: 'Aadhaar must be exactly 12 digits',
        })
        .optional()
        .or(z.literal('')),
    date_of_birth: z
        .string()
        .optional()
        .or(z.literal('')),
    blood_group: z
        .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''])
        .optional(),
    emergency_contact_name: z
        .string()
        .max(100, 'Emergency contact name must be under 100 characters')
        .optional()
        .or(z.literal('')),
    emergency_contact_phone: z
        .string()
        .transform(val => val.replace(/^\+91/, '').replace(/[\s\-]/g, '').slice(-10))
        .refine(val => val === '' || phoneRegex.test(val), {
            message: 'Emergency phone must be 10 digits starting with 6-9',
        })
        .optional()
        .or(z.literal('')),
    emergency_contact_relation: z
        .string()
        .max(50)
        .optional()
        .or(z.literal('')),
    registration_consent: z
        .union([z.boolean(), z.literal('on'), z.literal('true')])
        .transform(val => val === 'on' || val === 'true' || val === true),
    // Phase 1 — Patient Type Classification
    patient_type: z
        .enum(['cash', 'corporate', 'tpa_insurance'])
        .default('cash'),
    corporate_id: z.string().optional().or(z.literal('')),
    corporate_card_number: z.string().optional().or(z.literal('')),
    employee_id: z.string().optional().or(z.literal('')),
    // TPA fields saved via insurance_policies — validated loosely here
    tpa_provider_id: z.string().optional().or(z.literal('')),
    insurance_policy_number: z.string().optional().or(z.literal('')),
    insurance_validity_start: z.string().optional().or(z.literal('')),
    insurance_validity_end: z.string().optional().or(z.literal('')),
});

export type PatientRegistrationInput = z.infer<typeof patientRegistrationSchema>;

export const patientProfileUpdateSchema = z.object({
    full_name: z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(100)
        .regex(/^[^0-9]*$/, 'Name cannot contain numbers')
        .optional(),
    phone: z
        .string()
        .transform(val => val.replace(/[\s-]/g, ''))
        .refine(val => phoneRegex.test(val), {
            message: 'Phone must be 10 digits starting with 6-9',
        })
        .optional(),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    address: z.string().min(10).max(500).optional().or(z.literal('')),
    blood_group: z
        .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
        .optional()
        .or(z.literal('')),
    emergency_contact_name: z.string().max(100).optional().or(z.literal('')),
    emergency_contact_phone: z
        .string()
        .transform(val => val.replace(/[\s-]/g, ''))
        .refine(val => val === '' || phoneRegex.test(val), {
            message: 'Emergency contact phone must be 10 digits starting with 6-9',
        })
        .optional()
        .or(z.literal('')),
});

export type PatientProfileUpdateInput = z.infer<typeof patientProfileUpdateSchema>;
