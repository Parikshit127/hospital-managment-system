import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fetchVisitIds() {
    try {
        console.log('=== FETCHING VISIT IDs FROM DATABASE ===\n');

        // Fetch OPD visits (appointments)
        const appointments = await prisma.appointments.findMany({
            take: 5,
            orderBy: { appointment_date: 'desc' },
            select: {
                appointment_id: true,
                patient_id: true,
                department: true,
                status: true,
                doctor_name: true,
                appointment_date: true,
                patient: {
                    select: {
                        full_name: true,
                        phone: true,
                        email: true,
                    }
                }
            }
        });

        console.log('📋 OPD VISIT IDs (Appointment-based):');
        console.log('='.repeat(80));
        if (appointments.length > 0) {
            appointments.forEach((apt, idx) => {
                console.log(`\n${idx + 1}. Visit ID: ${apt.appointment_id}`);
                console.log(`   Patient ID: ${apt.patient_id}`);
                console.log(`   Patient Name: ${apt.patient.full_name}`);
                console.log(`   Phone: ${apt.patient.phone}`);
                console.log(`   Email: ${apt.patient.email || 'N/A'}`);
                console.log(`   Department: ${apt.department || 'N/A'}`);
                console.log(`   Doctor: ${apt.doctor_name || 'N/A'}`);
                console.log(`   Status: ${apt.status}`);
                console.log(`   Date: ${apt.appointment_date.toISOString()}`);
            });
        } else {
            console.log('No OPD appointments found.');
        }

        // Fetch IPD visits (admissions)
        console.log('\n\n🏥 IPD VISIT IDs (Admission-based):');
        console.log('='.repeat(80));
        const admissions = await prisma.admissions.findMany({
            take: 5,
            orderBy: { admission_date: 'desc' },
            select: {
                admission_id: true,
                patient_id: true,
                status: true,
                diagnosis: true,
                doctor_name: true,
                admission_date: true,
                discharge_date: true,
                patient: {
                    select: {
                        full_name: true,
                        phone: true,
                        email: true,
                    }
                }
            }
        });

        if (admissions.length > 0) {
            admissions.forEach((adm, idx) => {
                console.log(`\n${idx + 1}. Visit ID: ${adm.admission_id}`);
                console.log(`   Patient ID: ${adm.patient_id}`);
                console.log(`   Patient Name: ${adm.patient.full_name}`);
                console.log(`   Phone: ${adm.patient.phone}`);
                console.log(`   Email: ${adm.patient.email || 'N/A'}`);
                console.log(`   Doctor: ${adm.doctor_name || 'N/A'}`);
                console.log(`   Diagnosis: ${adm.diagnosis || 'N/A'}`);
                console.log(`   Status: ${adm.status}`);
                console.log(`   Admission Date: ${adm.admission_date.toISOString()}`);
                console.log(`   Discharge Date: ${adm.discharge_date?.toISOString() || 'Still admitted'}`);
            });
        } else {
            console.log('No IPD admissions found.');
        }

        // Summary
        console.log('\n\n📊 SUMMARY:');
        console.log('='.repeat(80));
        console.log(`Total OPD Visits (Appointments): ${appointments.length}`);
        console.log(`Total IPD Visits (Admissions): ${admissions.length}`);

        console.log('\n✅ Visit ID System:');
        console.log('   • OPD visits use: appointment_id (e.g., APT-20250115-XXXXX)');
        console.log('   • IPD visits use: admission_id (e.g., UUID format)');
        console.log('   • These are mapped to "visitId" in Zealthix integration');

    } catch (error) {
        console.error('Error fetching visit IDs:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fetchVisitIds();
