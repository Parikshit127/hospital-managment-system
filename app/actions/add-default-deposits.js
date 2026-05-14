const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addDefaultDeposits() {
    console.log('--- ADDING DEFAULT 10K DEPOSITS TO ACTIVE ADMISSIONS ---');
    
    try {
        const admissions = await prisma.admissions.findMany({
            where: { status: 'Admitted' }
        });

        console.log(`Found ${admissions.length} active admissions.`);

        for (const adm of admissions) {
            const deposits = await prisma.patientDeposit.findMany({
                where: { patient_id: adm.patient_id, status: 'Active' }
            });
            const currentDepositTotal = deposits.reduce((s, d) => s + Number(d.amount), 0);
            
            if (currentDepositTotal < 10000) {
                const deficit = 10000 - currentDepositTotal;
                console.log(`Patient ${adm.patient_id} (Admission ${adm.admission_id}) has only ${currentDepositTotal} deposit. Adding ${deficit}...`);

                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

                await prisma.patientDeposit.create({
                    data: {
                        deposit_number: `DEP-FIX-${dateStr}-${seq}`,
                        patient_id: adm.patient_id,
                        admission_id: adm.admission_id,
                        amount: deficit,
                        payment_method: 'Cash',
                        status: 'Active',
                        organizationId: adm.organizationId || 1
                    }
                });
                console.log(`✅ Added ${deficit} deposit.`);
            } else {
                console.log(`Skipping Patient ${adm.patient_id} - already has ${currentDepositTotal} deposit.`);
            }
        }

        console.log('--- DONE ---');
    } catch (error) {
        console.error('Error adding deposits:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addDefaultDeposits();
