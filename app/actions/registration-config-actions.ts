'use server';
import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

const DEFAULT_FIELDS = [
  { field_name: 'full_name', display_label: 'Full Name', is_required: true, is_visible: true, sort_order: 1 },
  { field_name: 'phone', display_label: 'Phone', is_required: true, is_visible: true, sort_order: 2 },
  { field_name: 'age', display_label: 'Age', is_required: true, is_visible: true, sort_order: 3 },
  { field_name: 'gender', display_label: 'Gender', is_required: true, is_visible: true, sort_order: 4 },
  { field_name: 'department', display_label: 'Department', is_required: true, is_visible: true, sort_order: 5 },
  { field_name: 'date_of_birth', display_label: 'Date of Birth', is_required: false, is_visible: true, sort_order: 6 },
  { field_name: 'blood_group', display_label: 'Blood Group', is_required: false, is_visible: true, sort_order: 7 },
  { field_name: 'email', display_label: 'Email', is_required: false, is_visible: true, sort_order: 8 },
  { field_name: 'address', display_label: 'Address', is_required: true, is_visible: true, sort_order: 9 },
  { field_name: 'aadhar', display_label: 'Aadhaar', is_required: false, is_visible: true, sort_order: 10 },
  { field_name: 'emergency_contact_name', display_label: 'Emergency Contact Name', is_required: false, is_visible: true, sort_order: 11 },
  { field_name: 'emergency_contact_phone', display_label: 'Emergency Contact Phone', is_required: false, is_visible: true, sort_order: 12 },
];

export async function getRegistrationFieldConfig() {
  try {
    const { db, organizationId } = await requireTenantContext();
    let configs = await (db.registrationFieldConfig as any).findMany({
      where: { organizationId }, orderBy: { sort_order: 'asc' },
    });
    if (configs.length === 0) {
      // Seed defaults
      await (db.registrationFieldConfig as any).createMany({
        data: DEFAULT_FIELDS.map(f => ({ ...f, organizationId })),
      });
      configs = await (db.registrationFieldConfig as any).findMany({
        where: { organizationId }, orderBy: { sort_order: 'asc' },
      });
    }
    return { success: true, data: configs };
  } catch (e) { return { success: false, data: DEFAULT_FIELDS }; }
}

export async function updateFieldConfig(id: string, updates: { is_required?: boolean; is_visible?: boolean }) {
  try {
    const { db } = await requireTenantContext();
    await (db.registrationFieldConfig as any).update({ where: { id }, data: updates });
    revalidatePath('/admin/registration-config');
    return { success: true };
  } catch (e) { return { success: false, error: 'Update failed' }; }
}
