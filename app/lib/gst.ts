/**
 * Centralized GST rate logic for Indian healthcare billing.
 *
 * Source: CBIC Notification No. 03/2022-Central Tax (Rate) dated 13-Jul-2022
 *   + GST Council 47th meeting clarifications (Healthcare services).
 *
 * Summary of rules implemented:
 *
 *   1. Room rent (per day):
 *        • ICU / CCU / NICU / PICU / HDU  →  EXEMPT (0%) regardless of rate
 *        • All other wards               →  5% GST WITHOUT ITC if rent > ₹5,000/day
 *                                            else 0%
 *
 *   2. Cosmetic / Plastic surgery (elective, non-clinical):
 *        • 18% GST (not covered by healthcare exemption)
 *
 *   3. OPD consultations / clinical services:
 *        • EXEMPT (0%) — clinical establishment exemption
 *
 *   4. Lab tests, diagnostics for in-patients:
 *        • EXEMPT (0%) when part of clinical treatment
 *
 *   5. Implants, pharmacy supplied separately:
 *        • Per product GST (5/12/18% depending on item) — leave to product master
 */

const INTENSIVE_CARE_KEYWORDS = ['ICU', 'CCU', 'NICU', 'PICU', 'HDU'];
const COSMETIC_KEYWORDS = ['COSMETIC', 'PLASTIC SURGERY', 'AESTHETIC'];

/**
 * Returns the GST rate (percentage, e.g. 5 means 5%) for a room/bed charge.
 *
 * @param wardType  The ward.ward_type field (e.g. "ICU", "Private", "General")
 * @param roomRate  Per-day rent (post-tier multiplier) in INR
 */
export function getRoomGSTRate(
    wardType: string | null | undefined,
    roomRate: number,
): number {
    const normalized = (wardType || '').toUpperCase().trim();
    if (INTENSIVE_CARE_KEYWORDS.some((k) => normalized.includes(k))) return 0;
    return roomRate > 5000 ? 5 : 0;
}

/**
 * Returns the GST rate for an IPD package line item.
 *
 * Cosmetic / plastic / aesthetic surgery packages are taxable at 18%.
 * Everything else is part of clinical treatment → exempt.
 *
 * @param category  The category string stored on the package
 *                  (e.g. "Cosmetic / Plastic Surgery" or "Orthopaedics")
 */
export function getPackageGSTRate(category: string | null | undefined): number {
    const normalized = (category || '').toUpperCase().trim();
    if (COSMETIC_KEYWORDS.some((k) => normalized.includes(k))) return 18;
    return 0;
}

/**
 * Returns the GST rate for an OPD invoice item.
 * OPD consultations + clinical services are exempt under healthcare exemption.
 * Pharmacy items dispensed via OPD use their own product GST (handled separately).
 */
export function getOpdGSTRate(serviceCategory: string | null | undefined): number {
    const normalized = (serviceCategory || '').toUpperCase().trim();
    // Aesthetic / cosmetic OPD procedures are still 18%
    if (COSMETIC_KEYWORDS.some((k) => normalized.includes(k))) return 18;
    return 0;
}

/**
 * Convenience: split a total tax amount into CGST + SGST (intra-state)
 * or report as IGST (inter-state). The hospital is typically intra-state,
 * so CGST+SGST is the default.
 */
export function splitGst(
    taxAmount: number,
    isInterState = false,
): { cgst: number; sgst: number; igst: number } {
    if (isInterState) return { cgst: 0, sgst: 0, igst: taxAmount };
    const half = taxAmount / 2;
    return { cgst: half, sgst: half, igst: 0 };
}
