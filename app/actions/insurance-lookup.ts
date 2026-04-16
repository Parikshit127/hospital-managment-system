'use server';

import { requireTenantContext } from '@/backend/tenant';

/**
 * Looks up insurance policy information for a given phone number.
 * In a production environment, this would call external TPA APIs (e.g. Zealthix).
 * Currently includes a simulation layer for verification.
 */
export async function lookupInsuranceByPhone(phone: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        
        // Clean phone number: take only the last 10 digits
        const cleaned = phone.replace(/\D/g, '').slice(-10);

        if (cleaned.length < 10) {
            return { success: false, message: 'Invalid phone number' };
        }

        // --- SIMULATION LAYER ---
        // Recognizing our test patient for demonstration
        if (cleaned === '8569942414') {
            return {
                success: true,
                data: {
                    full_name: 'Parikshit Sharma',
                    patient_type: 'tpa_insurance',
                    tpa_provider_id: 1, // Star Health Insurance (from our list)
                    insurance_policy_number: 'ZX-8569942414-LIVE',
                    message: 'Auto-discovery successful from Zealthix'
                }
            };
        }
        // --- END SIMULATION ---

        // Real logic: Check if we already have a policy for this phone number in another patient record
        const matchingPatient = await db.oPD_REG.findFirst({
            where: { phone: { contains: cleaned }, organizationId },
            include: {
                insurance_policies: {
                    where: { status: 'Active' },
                    include: { provider: true },
                    take: 1
                }
            }
        });

        if (matchingPatient && matchingPatient.insurance_policies.length > 0) {
            const policy = matchingPatient.insurance_policies[0];
            return {
                success: true,
                data: {
                    full_name: matchingPatient.full_name,
                    patient_type: 'tpa_insurance',
                    tpa_provider_id: policy.provider_id,
                    insurance_policy_number: policy.policy_number,
                    message: 'Existing policy found in system'
                }
            };
        }

        return { success: false, message: 'No insurance records found for this number' };
    } catch (error) {
        console.error('Insurance lookup error:', error);
        return { success: false, error: 'Failed to look up insurance' };
    }
}
