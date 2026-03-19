/**
 * Fallback department list used when DB fetch fails.
 * Primary source should always be the Department table via getDepartmentList().
 */
export const FALLBACK_DEPARTMENTS = [
    'General Medicine',
    'Cardiology',
    'Orthopedics',
    'Pediatrics',
    'Dermatology',
    'ENT',
    'Ophthalmology',
    'Neurology',
    'Pulmonology',
    'Gastroenterology',
    'Endocrinology',
    'Gynecology',
    'Urology',
    'Psychiatry',
    'Emergency Department',
] as const;

export type DepartmentName = (typeof FALLBACK_DEPARTMENTS)[number];
