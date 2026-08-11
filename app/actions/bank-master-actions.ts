'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v
  ));
}

export async function listHospitalBankAccounts(activeOnly = false) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // Check count for auto-seeding from Organization master if empty
    const count = await db.hospitalBankAccount.count({
      where: { organizationId },
    });

    if (count === 0) {
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          bank_name: true,
          bank_account_name: true,
          bank_account_number: true,
          bank_ifsc: true,
          bank_branch: true,
          bank_upi_id: true,
        },
      });

      if (org && (org.bank_name || org.bank_account_number || org.bank_ifsc)) {
        await db.hospitalBankAccount.create({
          data: {
            organizationId,
            bank_name: org.bank_name || 'Primary Bank',
            account_number: org.bank_account_number || '',
            ifsc_code: org.bank_ifsc || '',
            branch_name: org.bank_branch || null,
            account_holder_name: org.bank_account_name || org.name || 'Hospital Account',
            bank_upi_id: org.bank_upi_id || null,
            is_active: true,
          },
        });
      }
    }

    const where: any = { organizationId };
    if (activeOnly) {
      where.is_active = true;
    }

    const accounts = await db.hospitalBankAccount.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return { success: true, data: serialize(accounts) };
  } catch (error: any) {
    console.error('listHospitalBankAccounts error:', error);
    return { success: false, error: error.message || 'Failed to list bank accounts' };
  }
}

export async function createHospitalBankAccount(input: {
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  branch_name?: string;
  account_holder_name: string;
  bank_upi_id?: string;
  is_active?: boolean;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const bank_name = (input.bank_name || '').trim();
    const account_number = (input.account_number || '').trim();
    const ifsc_code = (input.ifsc_code || '').trim().toUpperCase();
    const account_holder_name = (input.account_holder_name || '').trim();
    const branch_name = (input.branch_name || '').trim() || null;
    const bank_upi_id = (input.bank_upi_id || '').trim() || null;
    const is_active = input.is_active ?? true;

    if (!bank_name) return { success: false, error: 'Bank Name is required' };
    if (!account_number) return { success: false, error: 'Account Number is required' };
    if (!ifsc_code) return { success: false, error: 'IFSC Code is required' };
    if (!account_holder_name) return { success: false, error: 'Account Holder Name is required' };

    const created = await db.hospitalBankAccount.create({
      data: {
        organizationId,
        bank_name,
        account_number,
        ifsc_code,
        branch_name,
        account_holder_name,
        bank_upi_id,
        is_active,
      },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: session?.id,
        username: session?.username || session?.name,
        role: session?.role,
        action: 'hospital_bank_account_created',
        module: 'finance',
        entity_type: 'hospital_bank_account',
        entity_id: String(created.id),
        details: JSON.stringify({ bank_name, account_number, ifsc_code }),
        organizationId,
      },
    });

    revalidatePath('/admin/finance/bank-master');
    revalidatePath('/admin/finance/tpa-insurance');
    return { success: true, data: serialize(created) };
  } catch (error: any) {
    console.error('createHospitalBankAccount error:', error);
    return { success: false, error: error.message || 'Failed to create bank account' };
  }
}

export async function updateHospitalBankAccount(
  id: number,
  input: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch_name?: string;
    account_holder_name?: string;
    bank_upi_id?: string;
    is_active?: boolean;
  }
) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const existing = await db.hospitalBankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return { success: false, error: 'Bank account not found' };

    const data: Record<string, any> = {};

    if (input.bank_name !== undefined) {
      const v = input.bank_name.trim();
      if (!v) return { success: false, error: 'Bank Name cannot be empty' };
      data.bank_name = v;
    }
    if (input.account_number !== undefined) {
      const v = input.account_number.trim();
      if (!v) return { success: false, error: 'Account Number cannot be empty' };
      data.account_number = v;
    }
    if (input.ifsc_code !== undefined) {
      const v = input.ifsc_code.trim().toUpperCase();
      if (!v) return { success: false, error: 'IFSC Code cannot be empty' };
      data.ifsc_code = v;
    }
    if (input.account_holder_name !== undefined) {
      const v = input.account_holder_name.trim();
      if (!v) return { success: false, error: 'Account Holder Name cannot be empty' };
      data.account_holder_name = v;
    }
    if (input.branch_name !== undefined) {
      data.branch_name = input.branch_name.trim() || null;
    }
    if (input.bank_upi_id !== undefined) {
      data.bank_upi_id = input.bank_upi_id.trim() || null;
    }
    if (input.is_active !== undefined) {
      data.is_active = input.is_active;
    }

    const updated = await db.hospitalBankAccount.update({
      where: { id: existing.id },
      data,
    });

    await db.system_audit_logs.create({
      data: {
        user_id: session?.id,
        username: session?.username || session?.name,
        role: session?.role,
        action: 'hospital_bank_account_updated',
        module: 'finance',
        entity_type: 'hospital_bank_account',
        entity_id: String(updated.id),
        details: JSON.stringify(data),
        organizationId,
      },
    });

    revalidatePath('/admin/finance/bank-master');
    revalidatePath('/admin/finance/tpa-insurance');
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error('updateHospitalBankAccount error:', error);
    return { success: false, error: error.message || 'Failed to update bank account' };
  }
}

export async function toggleHospitalBankAccountStatus(id: number) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const existing = await db.hospitalBankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return { success: false, error: 'Bank account not found' };

    const newStatus = !existing.is_active;
    const updated = await db.hospitalBankAccount.update({
      where: { id: existing.id },
      data: { is_active: newStatus },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: session?.id,
        username: session?.username || session?.name,
        role: session?.role,
        action: 'hospital_bank_account_status_toggled',
        module: 'finance',
        entity_type: 'hospital_bank_account',
        entity_id: String(updated.id),
        details: JSON.stringify({ is_active: newStatus }),
        organizationId,
      },
    });

    revalidatePath('/admin/finance/bank-master');
    revalidatePath('/admin/finance/tpa-insurance');
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error('toggleHospitalBankAccountStatus error:', error);
    return { success: false, error: error.message || 'Failed to toggle status' };
  }
}
