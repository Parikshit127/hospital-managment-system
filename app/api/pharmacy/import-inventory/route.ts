import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireTenantContext } from '@/backend/tenant';

export async function POST(req: NextRequest) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of rows) {
            try {
                // Map Excel columns to fields
                const brandName = String(row['Item Name'] || row['brand_name'] || row['ITEM NAME'] || '').trim();
                const batchNo   = String(row['Batch'] || row['batch_no'] || row['BATCH'] || '').trim();
                const stockRaw  = row['Stock'] ?? row['stock'] ?? row['STOCK'] ?? 0;
                const mrpRaw    = row['MRP'] ?? row['mrp'] ?? row['MRP '] ?? 0;
                const eprRaw    = row['EPR'] ?? row['epr'] ?? 0;
                const expiryRaw = row['Expiry Date'] ?? row['expiry_date'] ?? row['EXPIRY DATE'] ?? '';
                const rack      = String(row['Rack/Shelf'] ?? row['rack'] ?? '').trim();
                const unit      = String(row['Unit'] ?? row['unit'] ?? '').trim();
                const code      = String(row['Code'] ?? row['code'] ?? '').trim();

                if (!brandName || !batchNo) { skipped++; continue; }

                const stock  = Number(stockRaw) || 0;
                const mrp    = Number(mrpRaw)   || 0;
                const epr    = Number(eprRaw)   || 0;

                // Parse expiry date
                let expiryDate: Date;
                if (expiryRaw instanceof Date) {
                    expiryDate = expiryRaw;
                } else {
                    const parsed = new Date(expiryRaw);
                    expiryDate = isNaN(parsed.getTime()) ? new Date('2099-12-31') : parsed;
                }

                // Upsert medicine master
                let medicine = await prisma.pharmacy_medicine_master.findFirst({
                    where: { brand_name: brandName, organizationId },
                });

                if (!medicine) {
                    medicine = await prisma.pharmacy_medicine_master.create({
                        data: {
                            brand_name: brandName,
                            generic_name: '',
                            mrp,
                            purchase_price: epr,
                            selling_price: mrp,
                            price_per_unit: mrp,
                            ndc_code: code || null,
                            form: unit || null,
                            organizationId,
                        },
                    });
                }

                // Upsert batch
                const existing = await prisma.pharmacy_batch_inventory.findFirst({
                    where: { medicine_id: medicine.id, batch_no: batchNo },
                });

                if (existing) {
                    await prisma.pharmacy_batch_inventory.update({
                        where: { id: existing.id },
                        data: {
                            current_stock: existing.current_stock + stock,
                            expiry_date: expiryDate,
                            mrp,
                            cost_price: epr,
                            rack_location: rack || null,
                        },
                    });
                } else {
                    await prisma.pharmacy_batch_inventory.create({
                        data: {
                            medicine_id: medicine.id,
                            batch_no: batchNo,
                            current_stock: stock,
                            expiry_date: expiryDate,
                            mrp,
                            cost_price: epr,
                            rack_location: rack || null,
                        },
                    });
                }

                imported++;
            } catch (rowErr: any) {
                errors.push(`Row "${row['Item Name']}": ${rowErr.message}`);
                skipped++;
            }
        }

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            errors: errors.slice(0, 10), // return first 10 errors only
        });
    } catch (err: any) {
        console.error('Import error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
