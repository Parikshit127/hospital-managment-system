'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function generateLeadNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LEAD-${date}-${rand}`;
}

export async function getCRMDashboard() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const [totalLeads, newLeads, converted, lost, recentLeads, campaigns] = await Promise.all([
      (db.cRMLead as any).count({ where: { organizationId } }),
      (db.cRMLead as any).count({ where: { organizationId, status: 'New' } }),
      (db.cRMLead as any).count({ where: { organizationId, status: 'Converted' } }),
      (db.cRMLead as any).count({ where: { organizationId, status: 'Lost' } }),
      (db.cRMLead as any).findMany({
        where: { organizationId },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      (db.cRMCampaign as any).findMany({
        where: { organizationId },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
    ]);
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
    return { success: true, data: { totalLeads, newLeads, converted, lost, conversionRate, recentLeads, campaigns } };
  } catch (error) {
    return { success: false, data: null };
  }
}

export async function getLeads(filters?: { status?: string; source?: string; assignedTo?: string }) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const where: any = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.source) where.source = filters.source;
    if (filters?.assignedTo) where.assigned_to = filters.assignedTo;
    const leads = await (db.cRMLead as any).findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { activities: { orderBy: { performed_at: 'desc' }, take: 1 } },
    });
    return { success: true, data: leads };
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function createLead(data: {
  name: string; phone: string; email?: string; source: string;
  sourceDetail?: string; departmentInterest?: string; notes?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const lead = await (db.cRMLead as any).create({
      data: {
        organizationId,
        lead_number: generateLeadNumber(),
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        source: data.source,
        source_detail: data.sourceDetail || null,
        department_interest: data.departmentInterest || null,
        notes: data.notes || null,
      },
    });
    revalidatePath('/crm/leads');
    return { success: true, data: lead };
  } catch (error) {
    return { success: false, error: 'Failed to create lead' };
  }
}

export async function updateLeadStatus(leadId: string, status: string, lostReason?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const data: any = { status, updated_at: new Date() };
    if (status === 'Converted') data.converted_at = new Date();
    if (status === 'Lost' && lostReason) data.lost_reason = lostReason;
    await (db.cRMLead as any).update({ where: { id: leadId }, data });
    revalidatePath('/crm/leads');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update lead' };
  }
}

export async function addLeadActivity(data: {
  leadId: string; activityType: string; direction?: string;
  content: string; outcome?: string; performedBy: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const activity = await (db.cRMActivity as any).create({
      data: {
        lead_id: data.leadId,
        activity_type: data.activityType,
        direction: data.direction || null,
        content: data.content,
        outcome: data.outcome || null,
        performed_by: data.performedBy,
      },
    });
    await (db.cRMLead as any).update({
      where: { id: data.leadId },
      data: { last_contacted: new Date(), updated_at: new Date() },
    });
    revalidatePath('/crm/leads');
    return { success: true, data: activity };
  } catch (error) {
    return { success: false, error: 'Failed to add activity' };
  }
}

export async function getLeadDetail(leadId: string) {
  try {
    const { db } = await requireTenantContext();
    const lead = await (db.cRMLead as any).findUnique({
      where: { id: leadId },
      include: { activities: { orderBy: { performed_at: 'desc' } } },
    });
    return { success: true, data: lead };
  } catch (error) {
    return { success: false, data: null };
  }
}

export async function getCampaigns() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const campaigns = await (db.cRMCampaign as any).findMany({
      where: { organizationId },
      orderBy: { created_at: 'desc' },
    });
    return { success: true, data: campaigns };
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function createCampaign(data: {
  name: string; campaignType: string; targetAudience?: string;
  messageTemplate: string; scheduledAt?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const campaign = await (db.cRMCampaign as any).create({
      data: {
        organizationId,
        name: data.name,
        campaign_type: data.campaignType,
        target_audience: data.targetAudience || null,
        message_template: data.messageTemplate,
        scheduled_at: data.scheduledAt ? new Date(data.scheduledAt) : null,
        created_by: 'admin',
      },
    });
    revalidatePath('/crm/campaigns');
    return { success: true, data: campaign };
  } catch (error) {
    return { success: false, error: 'Failed to create campaign' };
  }
}

export async function getReferralNetwork() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const referrals = await (db.doctorReferralNetwork as any).findMany({
      where: { organizationId, is_active: true },
      orderBy: { referral_count: 'desc' },
    });
    return { success: true, data: referrals };
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function addReferralDoctor(data: {
  doctorName: string; specialty?: string; hospital?: string;
  phone?: string; email?: string; payoutPercentage?: number;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const doc = await (db.doctorReferralNetwork as any).create({
      data: {
        organizationId,
        doctor_name: data.doctorName,
        specialty: data.specialty || null,
        hospital: data.hospital || null,
        phone: data.phone || null,
        email: data.email || null,
        payout_percentage: data.payoutPercentage || null,
      },
    });
    revalidatePath('/crm/referrals');
    return { success: true, data: doc };
  } catch (error) {
    return { success: false, error: 'Failed to add referral doctor' };
  }
}

export async function getEngagementData() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const [active, atRisk, lapsed, lost, total] = await Promise.all([
      (db.patientEngagement as any).count({ where: { organizationId, risk_level: 'Active' } }),
      (db.patientEngagement as any).count({ where: { organizationId, risk_level: 'At_Risk' } }),
      (db.patientEngagement as any).count({ where: { organizationId, risk_level: 'Lapsed' } }),
      (db.patientEngagement as any).count({ where: { organizationId, risk_level: 'Lost' } }),
      (db.patientEngagement as any).count({ where: { organizationId } }),
    ]);
    const atRiskPatients = await (db.patientEngagement as any).findMany({
      where: { organizationId, risk_level: { in: ['At_Risk', 'Lapsed'] } },
      orderBy: { last_visit: 'asc' },
      take: 20,
    });
    return { success: true, data: { active, atRisk, lapsed, lost, total, atRiskPatients } };
  } catch (e) { return { success: false, data: null }; }
}

export async function getFeedbackAnalysis() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const feedbacks = await (db.patientFeedback as any).findMany({
      where: { organizationId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const total = feedbacks.length;
    const avgRating = total > 0
      ? (feedbacks.reduce((s: number, f: any) => s + (Number(f.rating) || 0), 0) / total).toFixed(1)
      : '0';
    const byRating = [5,4,3,2,1].map(r => ({
      rating: r,
      count: feedbacks.filter((f: any) => Number(f.rating) === r).length,
    }));
    return { success: true, data: { feedbacks, total, avgRating, byRating } };
  } catch (e) { return { success: false, data: null }; }
}

export async function getCRMReports() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const [totalLeads, bySource, byStatus, campaigns, referrals] = await Promise.all([
      (db.cRMLead as any).count({ where: { organizationId } }),
      (db.cRMLead as any).groupBy({ by: ['source'], where: { organizationId }, _count: { id: true } }),
      (db.cRMLead as any).groupBy({ by: ['status'], where: { organizationId }, _count: { id: true } }),
      (db.cRMCampaign as any).findMany({ where: { organizationId }, orderBy: { created_at: 'desc' }, take: 10 }),
      (db.doctorReferralNetwork as any).findMany({ where: { organizationId }, orderBy: { referral_count: 'desc' }, take: 10 }),
    ]);
    const converted = byStatus.find((s: any) => s.status === 'Converted')?._count?.id || 0;
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
    return { success: true, data: { totalLeads, bySource, byStatus, campaigns, referrals, conversionRate } };
  } catch (e) { return { success: false, data: null }; }
}
