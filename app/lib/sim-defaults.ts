/**
 * Built-in master data for a simulation that is not using a hospital's own.
 *
 * The Simulations page offers "Built-in defaults" as the alternative to copying a
 * hospital's master data. That option previously only switched the copy OFF — nothing
 * supplied the medicines and lab tests it promised, so the formulary and lab menu were
 * empty and neither prescriptions nor lab orders were ever generated.
 *
 * These are the same catalogues the bootstrap script seeds: the highest-volume Indian
 * OPD investigations, and enough brands per drug class that composePrescription() is not
 * forced to repeat the same handful of names on every prescription.
 *
 * Plain library. Never add 'use server'.
 */
import { prisma } from '@/backend/db';

export const DEFAULT_LAB_TESTS = [
    { test_name: 'Complete Blood Count', test_code: 'CBC', price: 450, category: 'Haematology', sample_type: 'Blood', turnaround_time: '4 hours' },
    { test_name: 'Random Blood Sugar', test_code: 'RBS', price: 150, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '2 hours' },
    { test_name: 'Liver Function Test', test_code: 'LFT', price: 900, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '6 hours' },
    { test_name: 'Kidney Function Test', test_code: 'KFT', price: 850, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '6 hours' },
    { test_name: 'Thyroid Profile (T3 T4 TSH)', test_code: 'TFT', price: 700, category: 'Endocrinology', sample_type: 'Blood', turnaround_time: '12 hours' },
    { test_name: 'Urine Routine & Microscopy', test_code: 'URM', price: 300, category: 'Clinical Pathology', sample_type: 'Urine', turnaround_time: '3 hours' },
    { test_name: 'C-Reactive Protein', test_code: 'CRP', price: 600, category: 'Immunology', sample_type: 'Blood', turnaround_time: '5 hours' },
    { test_name: 'Chest X-Ray PA View', test_code: 'CXR', price: 500, category: 'Radiology', sample_type: 'Imaging', turnaround_time: '2 hours' },
    { test_name: 'Serum Electrolytes', test_code: 'SE', price: 550, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '4 hours' },
    { test_name: 'Dengue NS1 Antigen', test_code: 'DEN', price: 1100, category: 'Serology', sample_type: 'Blood', turnaround_time: '8 hours' },
    // Added so the lab menu is not so short that the same few tests recur on screen.
    // These are the highest-volume OPD investigations in Indian practice.
    { test_name: 'Fasting Blood Sugar', test_code: 'FBS', price: 120, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '2 hours' },
    { test_name: 'HbA1c', test_code: 'HBA1C', price: 650, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '12 hours' },
    { test_name: 'Lipid Profile', test_code: 'LIPID', price: 800, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '12 hours' },
    { test_name: 'ESR', test_code: 'ESR', price: 180, category: 'Haematology', sample_type: 'Blood', turnaround_time: '3 hours' },
    { test_name: 'Widal Test', test_code: 'WID', price: 400, category: 'Serology', sample_type: 'Blood', turnaround_time: '8 hours' },
    { test_name: 'Malaria Rapid Test', test_code: 'MAL', price: 350, category: 'Serology', sample_type: 'Blood', turnaround_time: '2 hours' },
];

export const DEFAULT_MEDICINES = [
    { brand_name: 'Crocin 650', generic_name: 'Paracetamol', strength: '650mg', form: 'Tablet', mrp: 32, pack: '1x15' },
    { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanic Acid', strength: '625mg', form: 'Tablet', mrp: 205, pack: '1x10' },
    { brand_name: 'Pan 40', generic_name: 'Pantoprazole', strength: '40mg', form: 'Tablet', mrp: 148, pack: '1x15' },
    { brand_name: 'Zifi 200', generic_name: 'Cefixime', strength: '200mg', form: 'Tablet', mrp: 178, pack: '1x10' },
    { brand_name: 'Emeset 4', generic_name: 'Ondansetron', strength: '4mg', form: 'Tablet', mrp: 42, pack: '1x10' },
    { brand_name: 'Combiflam', generic_name: 'Ibuprofen + Paracetamol', strength: '400mg', form: 'Tablet', mrp: 58, pack: '1x20' },
    { brand_name: 'Monocef 1g', generic_name: 'Ceftriaxone', strength: '1g', form: 'Injection', mrp: 96, pack: '1 vial' },
    { brand_name: 'Normal Saline 500ml', generic_name: 'Sodium Chloride 0.9%', strength: '500ml', form: 'IV Fluid', mrp: 55, pack: '1 bottle' },
    { brand_name: 'Deriphyllin', generic_name: 'Etophylline + Theophylline', strength: '', form: 'Injection', mrp: 28, pack: '1 amp' },
    { brand_name: 'Lasix 40', generic_name: 'Furosemide', strength: '40mg', form: 'Tablet', mrp: 36, pack: '1x15' },
    { brand_name: 'Metrogyl 400', generic_name: 'Metronidazole', strength: '400mg', form: 'Tablet', mrp: 44, pack: '1x15' },
    { brand_name: 'Allegra 120', generic_name: 'Fexofenadine', strength: '120mg', form: 'Tablet', mrp: 189, pack: '1x10' },
    // Widened so composePrescription() can fill every drug class it weights for. Without
    // enough brands per class the same handful of names recur on every indent.
    // Acid suppressants and analgesics dominate Indian OPD prescribing, then vitamins.
    { brand_name: 'Dolo 650', generic_name: 'Paracetamol', strength: '650mg', form: 'Tablet', mrp: 34, pack: '1x15' },
    { brand_name: 'Zerodol SP', generic_name: 'Aceclofenac + Paracetamol + Serratiopeptidase', strength: '', form: 'Tablet', mrp: 129, pack: '1x10' },
    { brand_name: 'Voveran 50', generic_name: 'Diclofenac', strength: '50mg', form: 'Tablet', mrp: 42, pack: '1x10' },
    { brand_name: 'Brufen 400', generic_name: 'Ibuprofen', strength: '400mg', form: 'Tablet', mrp: 38, pack: '1x15' },
    { brand_name: 'Omez 20', generic_name: 'Omeprazole', strength: '20mg', form: 'Capsule', mrp: 86, pack: '1x15' },
    { brand_name: 'Rantac 150', generic_name: 'Ranitidine', strength: '150mg', form: 'Tablet', mrp: 32, pack: '1x10' },
    { brand_name: 'Razo D', generic_name: 'Rabeprazole + Domperidone', strength: '', form: 'Capsule', mrp: 152, pack: '1x10' },
    { brand_name: 'Becosules', generic_name: 'Vitamin B Complex', strength: '', form: 'Capsule', mrp: 48, pack: '1x20' },
    { brand_name: 'Shelcal 500', generic_name: 'Calcium + Vitamin D3', strength: '500mg', form: 'Tablet', mrp: 118, pack: '1x15' },
    { brand_name: 'Neurobion Forte', generic_name: 'Vitamin B Complex', strength: '', form: 'Tablet', mrp: 42, pack: '1x30' },
    { brand_name: 'Zincovit', generic_name: 'Multivitamin + Zinc', strength: '', form: 'Tablet', mrp: 108, pack: '1x15' },
    { brand_name: 'Limcee 500', generic_name: 'Vitamin C', strength: '500mg', form: 'Tablet', mrp: 28, pack: '1x15' },
    { brand_name: 'Azithral 500', generic_name: 'Azithromycin', strength: '500mg', form: 'Tablet', mrp: 128, pack: '1x5' },
    { brand_name: 'Taxim-O 200', generic_name: 'Cefixime', strength: '200mg', form: 'Tablet', mrp: 168, pack: '1x10' },
    { brand_name: 'Cifran 500', generic_name: 'Ciprofloxacin', strength: '500mg', form: 'Tablet', mrp: 74, pack: '1x10' },
    { brand_name: 'Doxy 100', generic_name: 'Doxycycline', strength: '100mg', form: 'Capsule', mrp: 58, pack: '1x10' },
    { brand_name: 'Cetzine 10', generic_name: 'Cetirizine', strength: '10mg', form: 'Tablet', mrp: 26, pack: '1x10' },
    { brand_name: 'Montek LC', generic_name: 'Montelukast + Levocetirizine', strength: '', form: 'Tablet', mrp: 196, pack: '1x10' },
    { brand_name: 'Avil 25', generic_name: 'Pheniramine', strength: '25mg', form: 'Tablet', mrp: 22, pack: '1x15' },
    { brand_name: 'Domstal 10', generic_name: 'Domperidone', strength: '10mg', form: 'Tablet', mrp: 38, pack: '1x10' },
    { brand_name: 'Perinorm', generic_name: 'Metoclopramide', strength: '10mg', form: 'Tablet', mrp: 24, pack: '1x10' },
    { brand_name: 'Asthalin Inhaler', generic_name: 'Salbutamol', strength: '100mcg', form: 'Inhaler', mrp: 148, pack: '200 doses' },
    { brand_name: 'Ascoril LS', generic_name: 'Levosalbutamol + Ambroxol + Guaifenesin', strength: '', form: 'Syrup', mrp: 132, pack: '100ML' },
    { brand_name: 'Montair 10', generic_name: 'Montelukast', strength: '10mg', form: 'Tablet', mrp: 178, pack: '1x10' },
    { brand_name: 'Glycomet 500', generic_name: 'Metformin', strength: '500mg', form: 'Tablet', mrp: 44, pack: '1x20' },
    { brand_name: 'Telma 40', generic_name: 'Telmisartan', strength: '40mg', form: 'Tablet', mrp: 148, pack: '1x15' },
    { brand_name: 'Amlokind 5', generic_name: 'Amlodipine', strength: '5mg', form: 'Tablet', mrp: 36, pack: '1x15' },
    { brand_name: 'Atorva 10', generic_name: 'Atorvastatin', strength: '10mg', form: 'Tablet', mrp: 92, pack: '1x15' },
    { brand_name: 'Thyronorm 50', generic_name: 'Thyroxine', strength: '50mcg', form: 'Tablet', mrp: 158, pack: '1x120' },
];

/** Seed the built-in catalogues into an organization. Idempotent. */
export async function seedDefaultMasterData(
    orgId: string,
): Promise<{ labTests: number; medicines: number }> {
    // Sequential on purpose — see stockSimMedicines: connection_limit=1 makes Promise.all
    // a queue against a 10s acquire timeout rather than real parallelism.
    const haveTests = await prisma.lab_test_inventory.findMany({
        where: { organizationId: orgId }, select: { test_name: true },
    });
    const haveMeds = await prisma.pharmacy_medicine_master.findMany({
        where: { organizationId: orgId }, select: { brand_name: true },
    });
    const testNames = new Set(haveTests.map(t => t.test_name));
    const medNames = new Set(haveMeds.map(m => m.brand_name));

    const newTests = DEFAULT_LAB_TESTS.filter(t => !testNames.has(t.test_name));
    if (newTests.length) {
        await prisma.lab_test_inventory.createMany({
            data: newTests.map(t => ({ ...t, organizationId: orgId, is_available: true })) as any,
            skipDuplicates: true,
        });
    }

    const newMeds = DEFAULT_MEDICINES.filter(m => !medNames.has(m.brand_name));
    if (newMeds.length) {
        await prisma.pharmacy_medicine_master.createMany({
            data: newMeds.map(m => ({
                ...m, organizationId: orgId, is_active: true,
                selling_price: m.mrp, purchase_price: Math.round(m.mrp * 0.72),
                price_per_unit: m.mrp, gst_percent: 12, tax_rate: 12,
            })) as any,
            skipDuplicates: true,
        });
    }

    return { labTests: newTests.length, medicines: newMeds.length };
}
