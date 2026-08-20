/**
 * Create the ward/bed layout for Axten Nulife Hospitals (org 660c8b5e-5822-48a6-8159-72dfed851703)
 * from the "Hospital Bed Occupancy" sheet Parikshit shared — 3 floors, 43 beds total,
 * currently 0 wards/beds on this org.
 *
 * Modeling (confirmed with the user): one ward per Room No., individual bed rows inside
 * it — not one ward per floor — so each room can be priced/assigned separately, matching
 * how the sheet is laid out and how reception assigns a specific bed to a patient.
 *
 * Fields NOT in the source sheet, filled with a placeholder the hospital admin must
 * review afterward via /admin/ipd-setup (WardManager):
 *   - cost_per_day / nursing_charge: no rates were given — left at 0.
 *   - ward_type: inferred from bed count as a starting label (1=Private, 2=Semi-Private,
 *     3=Triple Sharing, 4=General Ward; ICU rooms=ICU) — not stated in the sheet, purely
 *     a sensible default to edit.
 *   - The highlighted 3rd-floor rows (301, 303, 304, 306) — highlighting meaning wasn't
 *     specified, so no special flag was applied to them.
 *
 * bed_id / bed_name follow the exact convention the app's own "Add Beds" UI uses
 * (bulkAddBeds in app/admin/ipd-setup/actions.ts): bed_id = `${organizationId}-${ward_id}-${label}`.
 *
 * Usage (dry run prints what would be created, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/setup-nulife-wards-beds.ts
 * Apply:
 *   DATABASE_URL="<url>" npx tsx scripts/setup-nulife-wards-beds.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const ORG_ID = '660c8b5e-5822-48a6-8159-72dfed851703'; // Axten Nulife Hospitals

type RoomDef = { room: string; beds: number; floor: string; wardType?: string };

const WARD_TYPE_BY_BED_COUNT: Record<number, string> = {
    1: 'Private',
    2: 'Semi-Private',
    3: 'Triple Sharing',
    4: 'General Ward',
};

const ROOMS: RoomDef[] = [
    // 2nd Floor — 21 beds
    { room: '201', beds: 4, floor: '2' },
    { room: '202', beds: 2, floor: '2' },
    { room: '203', beds: 2, floor: '2' },
    { room: '204', beds: 2, floor: '2' },
    { room: '205', beds: 4, floor: '2' },
    { room: '206', beds: 2, floor: '2' },
    { room: '207', beds: 2, floor: '2' },
    { room: '208', beds: 3, floor: '2' },
    // 3rd Floor — 14 beds
    { room: '301', beds: 2, floor: '3' },
    { room: '302', beds: 2, floor: '3' },
    { room: '303', beds: 1, floor: '3' },
    { room: '304', beds: 1, floor: '3' },
    { room: '305', beds: 4, floor: '3' },
    { room: '306', beds: 1, floor: '3' },
    { room: '307', beds: 2, floor: '3' },
    { room: '308', beds: 1, floor: '3' },
    // 4th Floor (ICU) — 8 beds
    { room: 'ICU-01', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-02', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-03', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-04', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-05', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-06', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-07', beds: 1, floor: '4', wardType: 'ICU' },
    { room: 'ICU-08', beds: 1, floor: '4', wardType: 'ICU' },
];

async function main() {
    const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
    if (!org) throw new Error(`Org ${ORG_ID} not found`);

    const existingWardCount = await prisma.wards.count({ where: { organizationId: ORG_ID } });
    if (existingWardCount > 0) {
        throw new Error(`Org already has ${existingWardCount} ward(s) — aborting to avoid duplicating/clobbering existing setup. Delete or review manually first.`);
    }

    const totalBeds = ROOMS.reduce((s, r) => s + r.beds, 0);
    console.log(`Org: ${org.name} (${ORG_ID})`);
    console.log(`${ROOMS.length} wards (rooms) to create, ${totalBeds} beds total.\n`);

    for (const r of ROOMS) {
        const wardType = r.wardType || WARD_TYPE_BY_BED_COUNT[r.beds] || 'General Ward';
        console.log(`  ${APPLY ? 'CREATE' : 'WOULD CREATE'} ward "${r.room}"  floor ${r.floor}  type ${wardType}  (${r.beds} bed${r.beds !== 1 ? 's' : ''}, ₹0/day — rate not in source sheet)`);
    }

    if (!APPLY) {
        console.log('\nDry run only — no changes written. Re-run with --apply to create these wards/beds.');
        return;
    }

    await prisma.$transaction(async (tx) => {
        for (const r of ROOMS) {
            const wardType = r.wardType || WARD_TYPE_BY_BED_COUNT[r.beds] || 'General Ward';
            const ward = await tx.wards.create({
                data: {
                    ward_name: r.room,
                    ward_type: wardType,
                    floor_number: r.floor,
                    cost_per_day: 0,
                    nursing_charge: 0,
                    organizationId: ORG_ID,
                    is_active: true,
                },
            });

            const bedsData = [];
            for (let i = 1; i <= r.beds; i++) {
                const label = r.beds === 1 ? r.room : `${r.room}-${i}`;
                bedsData.push({
                    bed_id: `${ORG_ID}-${ward.ward_id}-${label}`,
                    bed_name: r.beds === 1 ? r.room : `Room ${r.room} - Bed ${i}`,
                    ward_id: ward.ward_id,
                    status: 'Available',
                    bed_category: wardType,
                    pricing_tier: 'standard',
                    is_isolation: false,
                    organizationId: ORG_ID,
                });
            }
            await tx.beds.createMany({ data: bedsData });
        }
    });

    console.log(`\nCreated ${ROOMS.length} wards, ${totalBeds} beds for ${org.name}.`);
    console.log('Room rates are all ₹0/day — set real per-room rates via /admin/ipd-setup before this hospital goes live.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
