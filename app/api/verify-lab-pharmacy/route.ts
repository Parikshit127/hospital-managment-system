import { NextResponse } from 'next/server';
import { getLabOrders, uploadResult } from '@/app/actions/lab-actions';
import { addInventoryBatch, getInventory, generateInvoice } from '@/app/actions/pharmacy-actions';
import { prisma } from '@/backend/db';

const DEFAULT_ORG = 'org-avani-default';

export async function GET() {
    const results = {
        step1_create_patient: 'PENDING',
        step2_create_lab_order: 'PENDING',
        step3_lab_technician_view: 'PENDING',
        step4_lab_technician_upload: 'PENDING',
        step5_pharmacy_add_inventory: 'PENDING',
        step6_pharmacy_view_inventory: 'PENDING',
        step7_pharmacy_billing: 'PENDING',
        errors: [] as string[]
    };

    const TEST_ID = Math.floor(Math.random() * 10000);
    const PATIENT_ID = `TEST-PAT-${TEST_ID}`;
    const BARCODE = `LAB-${TEST_ID}`;
    const BATCH_NO = `BATCH-${TEST_ID}`;
    const MEDICINE_NAME = `Test Med ${TEST_ID}`;

    try {
        // --- STEP 1: Create Dummy Patient (OPD_REG) ---
        const patient = await prisma.oPD_REG.create({
            data: {
                patient_id: PATIENT_ID,
                full_name: 'Test Patient Verify',
                age: '30',
                gender: 'Male',
                phone: '9999999999',
                address: 'Test Address',
                email: 'test@example.com',
                organizationId: DEFAULT_ORG,
            }
        });
        results.step1_create_patient = 'SUCCESS';

        // --- STEP 2: Create Lab Order ---
        const labOrder = await prisma.lab_orders.create({
            data: {
                barcode: BARCODE,
                patient_id: PATIENT_ID,
                doctor_id: 'Test Doctor',
                test_type: 'Complete Blood Count',
                status: 'Pending',
                organizationId: DEFAULT_ORG,
            }
        });
        results.step2_create_lab_order = 'SUCCESS';

        // --- STEP 3: Lab Technician View Orders ---
        const labOrders = await getLabOrders('Pending');
        if (!labOrders.success) throw new Error('Failed to fetch lab orders: ' + JSON.stringify(labOrders));

        const foundOrder = (labOrders.data as any[]).find((o: any) => o.order_id === BARCODE);
        if (!foundOrder) throw new Error('Created lab order not found in pending list');
        results.step3_lab_technician_view = 'SUCCESS';

        // --- STEP 4: Lab Technician Upload Result ---
        const uploadRes = await uploadResult(BARCODE, 'Haemoglobin: 14.5', 'Normal');
        if (!uploadRes.success) throw new Error('Failed to upload result: ' + uploadRes.error);
        results.step4_lab_technician_upload = 'SUCCESS';

        // --- STEP 5: Pharmacy Add Inventory ---
        const medicine = await prisma.pharmacy_medicine_master.create({
            data: {
                brand_name: MEDICINE_NAME,
                generic_name: 'Test Generic',
                price_per_unit: 10,
                organizationId: DEFAULT_ORG,
            }
        });

        const addInvRes = await addInventoryBatch({
            medicine_id: medicine.id,
            brand_name: MEDICINE_NAME,
            batch_no: BATCH_NO,
            stock: 100,
            price: 15,
            expiry: new Date('2025-12-31'),
            rack: 'A1'
        });

        if (!addInvRes.success) throw new Error('Failed to add inventory: ' + addInvRes.error);
        results.step5_pharmacy_add_inventory = 'SUCCESS';

        // --- STEP 6: View Inventory ---
        const inventoryRes = await getInventory();
        if (!inventoryRes.success) throw new Error('Failed to fetch inventory');
        const foundBatch = (inventoryRes.data as any[]).find((i: any) => i.batch_no === BATCH_NO);
        if (!foundBatch) throw new Error('Added batch not found in inventory');
        results.step6_pharmacy_view_inventory = 'SUCCESS';

        // --- STEP 7: Pharmacy Billing ---
        const invoicePayload = [{
            batch_no: BATCH_NO,
            medicine_id: medicine.id,
            quantity: 2,
            unit_price: 15,
            medicine_name: MEDICINE_NAME,
            expiry_date: new Date('2025-12-31'),
            stock_count: 100
        }];
        const billingRes = await generateInvoice(PATIENT_ID, invoicePayload);
        if (!billingRes.success) throw new Error('Failed to generate invoice: ' + billingRes.error);
        results.step7_pharmacy_billing = 'SUCCESS';

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('VERIFICATION ERROR:', error);
        results.errors.push(error.message || String(error));
        return NextResponse.json({ success: false, results, error: error.message }, { status: 500 });
    }
}
