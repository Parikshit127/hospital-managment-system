import type { ImportType, ColumnMapping, BatchResult, ValidationError } from '@/app/types/import';
import { transformRow } from './data-transformer';
import { normalizePhone } from './data-transformer';
import { generateUHID } from '@/app/lib/uhid';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TenantPrismaClient = any;
import bcrypt from 'bcryptjs';

const CHUNK_SIZE = 500;

export async function processImportBatch(
    data: Record<string, string>[],
    mapping: ColumnMapping,
    importType: ImportType,
    startRow: number,
    db: TenantPrismaClient,
    _organizationId: string,
    skipRows: Set<number>,
): Promise<BatchResult> {
    const endRow = Math.min(startRow + CHUNK_SIZE, data.length);
    const chunk = data.slice(startRow, endRow);
    const errors: ValidationError[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < chunk.length; i++) {
        const globalRow = startRow + i;
        if (skipRows.has(globalRow)) continue;

        try {
            const transformed = transformRow(chunk[i], mapping, importType);
            await insertRecord(transformed, importType, db);
            successful++;
        } catch (err) {
            failed++;
            errors.push({
                row: globalRow,
                field: '',
                value: null,
                message: err instanceof Error ? err.message : 'Unknown error during import',
                severity: 'error',
            });
        }
    }

    return {
        processed: endRow - startRow,
        successful,
        failed,
        errors,
        nextStartRow: endRow,
        isComplete: endRow >= data.length,
    };
}

async function insertRecord(
    data: Record<string, unknown>,
    importType: ImportType,
    db: TenantPrismaClient,
): Promise<void> {
    switch (importType) {
        case 'patients':
            await insertPatient(data, db);
            break;
        case 'staff':
            await insertStaff(data, db);
            break;
        case 'invoices':
            await insertInvoice(data, db);
            break;
        case 'lab_results':
            await insertLabResult(data, db);
            break;
        case 'pharmacy':
            await insertPharmacy(data, db);
            break;
        case 'appointments':
            await insertAppointment(data, db);
            break;
    }
}

async function insertPatient(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const patientId = await generateUHID(db);
    const phone = data.phone ? normalizePhone(String(data.phone)) : null;

    // Check for existing patient with same phone to avoid duplicates
    if (phone) {
        const existing = await db.oPD_REG.findFirst({
            where: { phone, is_archived: undefined },
            select: { id: true },
        });
        if (existing) {
            throw new Error(`Patient with phone ${phone} already exists`);
        }
    }

    await db.oPD_REG.create({
        data: {
            patient_id: patientId,
            full_name: String(data.full_name || ''),
            age: data.age ? String(data.age) : null,
            gender: data.gender ? String(data.gender) : null,
            phone: phone,
            email: data.email ? String(data.email) : null,
            address: data.address ? String(data.address) : null,
            aadhar_card: data.aadhar_card ? String(data.aadhar_card) : null,
            blood_group: data.blood_group ? String(data.blood_group) : null,
            date_of_birth: data.date_of_birth ? String(data.date_of_birth) : null,
            allergies: data.allergies ? String(data.allergies) : null,
            chronic_conditions: data.chronic_conditions ? String(data.chronic_conditions) : null,
            emergency_contact_name: data.emergency_contact_name ? String(data.emergency_contact_name) : null,
            emergency_contact_phone: data.emergency_contact_phone ? String(data.emergency_contact_phone) : null,
            emergency_contact_relation: data.emergency_contact_relation ? String(data.emergency_contact_relation) : null,
            department: data.department ? String(data.department) : null,
            registration_consent: true,
        },
    });
}

async function insertStaff(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const username = String(data.username || '');
    if (!username) throw new Error('Username is required');

    const existing = await db.user.findFirst({
        where: { username },
        select: { id: true },
    });
    if (existing) {
        throw new Error(`User with username "${username}" already exists`);
    }

    // Generate a temporary password
    const tempPassword = `Temp${Math.random().toString(36).slice(2, 8)}!1`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await db.user.create({
        data: {
            username,
            password: hashedPassword,
            name: String(data.name || ''),
            role: String(data.role || 'doctor'),
            specialty: data.specialty ? String(data.specialty) : null,
            email: data.email ? String(data.email) : null,
            phone: data.phone ? String(data.phone) : null,
            consultation_fee: data.consultation_fee ? Number(data.consultation_fee) : null,
            working_hours: data.working_hours ? String(data.working_hours) : null,
            is_active: true,
        },
    });
}

async function insertInvoice(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const patientId = String(data.patient_id || '');
    if (!patientId) throw new Error('Patient ID is required');

    // Verify patient exists
    const patient = await db.oPD_REG.findFirst({
        where: { patient_id: patientId, is_archived: undefined },
        select: { patient_id: true },
    });
    if (!patient) {
        throw new Error(`Patient ${patientId} not found in system`);
    }

    const totalAmount = Number(data.total_amount) || 0;
    const discount = Number(data.discount) || 0;
    const netAmount = totalAmount - discount;
    const paidAmount = Number(data.paid_amount) || 0;
    const balanceDue = netAmount - paidAmount;

    let status = String(data.status || 'Final');
    if (balanceDue <= 0 && paidAmount > 0) status = 'Paid';
    else if (paidAmount > 0 && balanceDue > 0) status = 'Partial';

    const invoiceNumber = String(data.invoice_number || `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    const invoice = await db.invoices.create({
        data: {
            invoice_number: invoiceNumber,
            patient_id: patientId,
            invoice_type: String(data.invoice_type || 'OPD'),
            total_amount: totalAmount,
            total_discount: discount,
            net_amount: netAmount,
            paid_amount: paidAmount,
            balance_due: balanceDue,
            status,
            notes: 'Imported from historical data',
            finalized_at: new Date(),
        },
    });

    // Create line items if description provided
    const itemDesc = data.item_description ? String(data.item_description) : null;
    if (itemDesc && invoice) {
        const items = itemDesc.split(';').map(s => s.trim()).filter(Boolean);
        const unitPrice = items.length > 0 ? totalAmount / items.length : totalAmount;

        for (const desc of items) {
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: String(data.invoice_type || 'General'),
                    description: desc,
                    quantity: 1,
                    unit_price: unitPrice,
                    total_price: unitPrice,
                    discount: 0,
                    net_price: unitPrice,
                },
            });
        }
    }
}

async function insertLabResult(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const patientId = String(data.patient_id || '');
    if (!patientId) throw new Error('Patient ID is required');

    const barcode = `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.lab_orders.create({
        data: {
            barcode,
            patient_id: patientId,
            doctor_id: String(data.doctor_id || 'imported'),
            test_type: String(data.test_type || 'Unknown'),
            status: String(data.status || 'Completed'),
            result_value: data.result_value ? String(data.result_value) : null,
            technician_remarks: data.technician_remarks ? String(data.technician_remarks) : null,
            is_critical: data.is_critical === true,
        },
    });
}

async function insertPharmacy(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const brandName = String(data.brand_name || '');
    if (!brandName) throw new Error('Brand name is required');

    // Check if medicine already exists
    let medicine = await db.pharmacy_medicine_master.findFirst({
        where: { brand_name: brandName },
        select: { id: true },
    });

    if (!medicine) {
        medicine = await db.pharmacy_medicine_master.create({
            data: {
                brand_name: brandName,
                generic_name: data.generic_name ? String(data.generic_name) : null,
                category: data.category ? String(data.category) : null,
                manufacturer: data.manufacturer ? String(data.manufacturer) : null,
                price_per_unit: Number(data.price_per_unit) || 0,
                min_threshold: data.min_threshold ? Number(data.min_threshold) : 10,
            },
        });
    }

    // Add batch if batch info provided
    if (data.batch_no && medicine) {
        await db.pharmacyBatchInventory.create({
            data: {
                medicine_id: medicine.id,
                batch_no: String(data.batch_no),
                current_stock: Number(data.current_stock) || 0,
                expiry_date: data.expiry_date ? new Date(String(data.expiry_date)) : new Date('2025-12-31'),
                rack_location: data.rack_location ? String(data.rack_location) : null,
            },
        });
    }
}

async function insertAppointment(
    data: Record<string, unknown>,
    db: TenantPrismaClient,
): Promise<void> {
    const patientId = String(data.patient_id || '');
    if (!patientId) throw new Error('Patient ID is required');

    const appointmentId = `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.appointments.create({
        data: {
            appointment_id: appointmentId,
            patient_id: patientId,
            doctor_name: data.doctor_name ? String(data.doctor_name) : null,
            doctor_id: data.doctor_id ? String(data.doctor_id) : null,
            department: data.department ? String(data.department) : null,
            status: String(data.status || 'Completed'),
            reason_for_visit: data.reason_for_visit ? String(data.reason_for_visit) : null,
            appointment_date: data.appointment_date ? new Date(String(data.appointment_date)) : new Date(),
        },
    });
}

export { CHUNK_SIZE };
