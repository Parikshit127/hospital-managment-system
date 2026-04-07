'use server';

import { requireTenantContext } from '@/backend/tenant';
import { notifyPatient } from '@/app/lib/notify-patient';
import OpenAI from 'openai';


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function dischargePatient(patientId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        console.log(`Initiating Discharge for Patient: ${patientId}`);

        const activeAdmission = await db.admissions.findFirst({
            where: {
                patient_id: patientId,
                status: 'Admitted'
            }
        });

        if (activeAdmission) {
            await db.admissions.update({
                where: { admission_id: activeAdmission.admission_id },
                data: {
                    status: 'Discharged',
                    discharge_date: new Date()
                }
            });
        }


        await db.system_audit_logs.create({
            data: {
                action: 'DISCHARGE_PATIENT',
                module: 'discharge',
                entity_type: 'patient',
                entity_id: patientId,
                details: JSON.stringify({ admission_id: activeAdmission?.admission_id }),
                organizationId,
            }
        });

        return {
            success: true,
            pdfBase64: null
        };

    } catch (error: any) {
        console.error('Discharge Error:', error);
        return { success: false, error: error.message || 'Failed to generate discharge summary' };
    }
}

export async function getAdmittedPatients() {
    try {
        const { db } = await requireTenantContext();

        const admissions = await db.admissions.findMany({
            where: { status: 'Admitted' },
            include: {
                patient: true,
            },
            orderBy: { admission_date: 'desc' }
        });

        const data = admissions.map((a: any) => {
            const daysDiff = Math.ceil((new Date().getTime() - a.admission_date.getTime()) / (1000 * 60 * 60 * 24));
            return {
                id: a.patient_id,
                admission_id: a.admission_id,
                patient_name: a.patient?.full_name || 'Unknown',
                doctor: a.doctor_name || 'Unassigned',
                diagnosis: a.diagnosis || 'Pending',
                days: daysDiff,
                status: a.status,
                admission_date: a.admission_date,
            };
        });

        return { success: true, data };
    } catch (error: any) {
        console.error('getAdmittedPatients error:', error);
        return { success: false, data: [], error: error.message };
    }
}


export async function processDischarge(patientId: string, patientName: string, notes: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

      
        const activeAdmission = await db.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted' }
        });

        if (activeAdmission) {
            await db.admissions.update({
                where: { admission_id: activeAdmission.admission_id },
                data: {
                    status: 'Discharged',
                    discharge_date: new Date()
                }
            });

            
            await db.appointments.updateMany({
                where: { patient_id: patientId, status: 'Admitted' },
                data: { status: 'Completed' }
            });

           
            if (activeAdmission.bed_id) {
                await db.beds.update({
                    where: { bed_id: activeAdmission.bed_id },
                    data: { status: 'Cleaning' }
                });
            }

            
            const ward = await db.wards.findUnique({ where: { ward_id: activeAdmission.ward_id ?? 0 } });
            const daysAdmitted = Math.max(1, Math.ceil(
                (new Date().getTime() - new Date(activeAdmission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
            ));
            const roomRate = Number(ward?.cost_per_day || 0);
            const roomCharge = roomRate * daysAdmitted;


            let invoice = await db.invoices.findFirst({
                where: { admission_id: activeAdmission.admission_id, status: { not: 'Cancelled' } }
            });

          
            let resolvedWard = ward;
            if (!resolvedWard && activeAdmission.bed_id) {
                const bed = await db.beds.findUnique({
                    where: { bed_id: activeAdmission.bed_id },
                    include: { wards: true }
                });
                resolvedWard = bed?.wards ?? null;
            }

            const resolvedRoomRate = Number(resolvedWard?.cost_per_day || 500); 
            const resolvedRoomCharge = resolvedRoomRate * daysAdmitted;

            if (!invoice) {
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
                invoice = await db.invoices.create({
                    data: {
                        invoice_number: `INV-${dateStr}-${seq}`,
                        patient_id: patientId,
                        admission_id: activeAdmission.admission_id,
                        invoice_type: 'IPD',
                        status: 'Final',
                        total_amount: resolvedRoomCharge,
                        net_amount: resolvedRoomCharge,
                        balance_due: resolvedRoomCharge,
                        finalized_at: new Date(),
                        organizationId,
                    }
                });

                await db.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        department: 'IPD',
                        description: `Room charges - ${resolvedWard?.ward_name || 'General Ward'} (${daysAdmitted} day${daysAdmitted > 1 ? 's' : ''} × ₹${resolvedRoomRate}/day)`,
                        quantity: daysAdmitted,
                        unit_price: resolvedRoomRate,
                        total_price: resolvedRoomCharge,
                        net_price: resolvedRoomCharge,
                        organizationId,
                    }
                });
            } else {
                
                const resolvedRoomCharge2 = resolvedRoomRate * daysAdmitted;
                if (resolvedRoomCharge2 > 0) {
                    await db.invoice_items.create({
                        data: {
                            invoice_id: invoice.id,
                            department: 'IPD',
                            description: `Room charges - ${resolvedWard?.ward_name || 'General Ward'} (${daysAdmitted} day${daysAdmitted > 1 ? 's' : ''} × ₹${resolvedRoomRate}/day)`,
                            quantity: daysAdmitted,
                            unit_price: resolvedRoomRate,
                            total_price: resolvedRoomCharge2,
                            net_price: resolvedRoomCharge2,
                            organizationId,
                        }
                    });
                    await db.invoices.update({
                        where: { id: invoice.id },
                        data: {
                            total_amount: resolvedRoomCharge2,
                            net_amount: resolvedRoomCharge2,
                            balance_due: resolvedRoomCharge2,
                            status: 'Final',
                            finalized_at: new Date(),
                        }
                    });
                } else {
                    await db.invoices.update({
                        where: { id: invoice.id },
                        data: { status: 'Final', finalized_at: new Date() }
                    });
                }
            }

            
            await db.discharge_summaries.create({
                data: {
                    admission_id: activeAdmission.admission_id,
                    patient_name: patientName,
                    generated_summary: `<h2>Discharge Summary</h2><p>Patient: ${patientName}</p><p>Notes: ${notes}</p><p>Date: ${new Date().toLocaleString()}</p>`,
                    organizationId,
                }
            });
        }

       
        await db.system_audit_logs.create({
            data: {
                action: 'PROCESS_DISCHARGE',
                module: 'discharge',
                entity_type: 'patient',
                entity_id: patientId,
                details: JSON.stringify({ patientName, notes }),
                organizationId,
            }
        });


        const patient = await db.oPD_REG.findFirst({ where: { patient_id: patientId }, select: { phone: true, email: true } });
        if (patient) {
            notifyPatient(
                { email: patient.email, phone: patient.phone },
                { type: 'discharge', patientName },
            ).catch(err => console.warn('[Notify] Discharge notification failed:', err));
        }

        return { success: true };
    } catch (error: any) {
        console.error('processDischarge error:', error);
        return { success: false, error: error.message };
    }
}


export async function generateAISummary(admissionId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: true },
        });

        if (!admission) {
            return { success: false, error: 'Admission not found' };
        }

        const [vitals, ehrNotes, labOrders] = await Promise.all([
            db.vital_signs.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
                take: 10,
            }),
            db.clinical_EHR.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
            db.lab_orders.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        const patientName = admission.patient?.full_name || 'Unknown';
        const patientAge = admission.patient?.age || 'Unknown';
        const diagnosisList = ehrNotes.filter((n: any) => n.diagnosis).map((n: any) => n.diagnosis).join(', ') || admission.diagnosis || 'Not recorded';
        const doctorNotes = ehrNotes.filter((n: any) => n.doctor_notes).map((n: any) => n.doctor_notes).join('. ') || 'No clinical notes';
        const labResults = labOrders.map((l: any) => `${l.test_type}: ${l.result_value ?? 'Pending'}`).join(', ') || 'No lab orders';
        const vitalsSummary = vitals.length > 0
            ? `BP: ${vitals[0].blood_pressure || '-'}, HR: ${vitals[0].heart_rate || '-'}, Temp: ${vitals[0].temperature || '-'}, SpO2: ${vitals[0].oxygen_sat || '-'}%`
            : 'No vitals recorded';

        const prompt = `You are a senior physician writing a hospital discharge summary.
Based on the following clinical data, write a concise, professional discharge summary.

Patient: ${patientName}, Age: ${patientAge}
Admission Date: ${admission.admission_date.toISOString().split('T')[0]}
Attending Doctor: ${admission.doctor_name || 'Not assigned'}
Diagnosis: ${diagnosisList}
Doctor Notes: ${doctorNotes}
Vitals on Admission: ${vitalsSummary}
Lab Results: ${labResults}

Write the discharge summary with these sections:
1. Chief Complaint
2. Hospital Course
3. Significant Findings
4. Discharge Diagnosis
5. Medications on Discharge
6. Follow-up Instructions

Keep it clinical, concise, and professional. Use HTML formatting with <h3> tags for section headings and <p> tags for content.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000,
        });

        const summary = completion.choices[0]?.message?.content || 'AI summary generation failed.';

        // Log audit event
        await db.system_audit_logs.create({
            data: {
                action: 'AI_DISCHARGE_SUMMARY',
                module: 'discharge',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({ patient_id: admission.patient_id, model: 'gpt-4o' }),
                organizationId,
            },
        });

        return { success: true, summary };
    } catch (error: any) {
        console.error('generateAISummary error:', error);
        return { success: false, error: error.message || 'Failed to generate AI summary' };
    }
}
