/**
 * Pharmacy-specific branding per organization.
 *
 * The dispensing pharmacy (Garnet Medicare) operates at different locations
 * for each hospital, so the address and GSTIN differ by org.
 */

export interface PharmacyBranding {
    name: string;
    division: string;
    address: string;
    gstin: string;
    phone: string;
    email: string;
    /** Drugs & Cosmetics Act 1940 — Form 20 retail sale-of-drugs license no. */
    drugLicenseForm20: string;
    /** Drugs & Cosmetics Act 1940 — Form 21 retail sale-of-drugs (restricted) license no. */
    drugLicenseForm21: string;
}

const PHARMACY_CONFIG: Record<string, PharmacyBranding> = {
    // Axten Hospitals — Delhi
    'org-axten-production': {
        name: 'Garnet Medicare',
        division: '(Division of Garnet Pharmaceutical)',
        address: 'B-162, East of Kailash Road, New Delhi, Delhi 110065',
        gstin: '07AKIPA3324R1Z0',
        phone: '9650506959',
        email: ' garnetmedicare@gmail.com',
        // Separate license, not on file yet — leave blank rather than reuse Gurugram's.
        drugLicenseForm20: '',
        drugLicenseForm21: '',
    },
    // Avise Hospital Superspeciality — Gurugram
    '0425857b-6293-4d91-86b2-bd049de66252': {
        name: 'Garnet Medicare',
        division: '(Division of Garnet Pharmaceutical)',
        address: '1021/2A, Jharsha Patti, Near Shiv Mandir, Opp. Community Center, Gurgaon, Haryana - 122001',
        gstin: '06AKIPA3324R1Z2',
        phone: '9650506959',
        email: 'garnetmedicare@gmail.com',
        // Haryana FDA, valid upto 05-Jul-2031.
        drugLicenseForm20: 'RLF20HR2026003488',
        drugLicenseForm21: 'RLF21HR2026003471',
    },
};

const DEFAULT_PHARMACY: PharmacyBranding = {
    name: 'Garnet Medicare',
    division: '(Division of Garnet Pharmaceutical)',
    address: '',
    gstin: '',
    phone: '',
    email: '',
    drugLicenseForm20: '',
    drugLicenseForm21: '',
};

export function getPharmacyBranding(organizationId: string): PharmacyBranding {
    return PHARMACY_CONFIG[organizationId] || DEFAULT_PHARMACY;
}
