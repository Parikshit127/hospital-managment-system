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
}

const PHARMACY_CONFIG: Record<string, PharmacyBranding> = {
    // Axten Hospitals — Delhi
    'org-axten-production': {
        name: 'Garnet Medicare',
        division: '(Division of Garnet Pharmaceutical)',
        address: 'B-162, East of Kailash Road, New Delhi, Delhi 110065',
        gstin: '07AKIPA3324R1Z0',
    },
    // Avise Hospital Superspeciality — Gurugram
    '0425857b-6293-4d91-86b2-bd049de66252': {
        name: 'Garnet Medicare',
        division: '(Division of Garnet Pharmaceutical)',
        address: '209-P, Sector-38, Gurugram, Haryana - 122001',
        gstin: '',
    },
};

const DEFAULT_PHARMACY: PharmacyBranding = {
    name: 'Garnet Medicare',
    division: '(Division of Garnet Pharmaceutical)',
    address: '',
    gstin: '',
};

export function getPharmacyBranding(organizationId: string): PharmacyBranding {
    return PHARMACY_CONFIG[organizationId] || DEFAULT_PHARMACY;
}
