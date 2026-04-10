// Client-safe — no 'use server'. Generates Excel template files in-browser.
import { generateTemplateFile } from './parser';
import { getTemplateHeaders } from './templates';
import type { MasterImportType } from './master-validators';

// Sample rows shown in each template so admins understand the expected format.
const SAMPLE_ROWS: Record<MasterImportType, Record<string, string>> = {
  doctor_master: {
    name: 'Dr. Priya Sharma', username: 'priya.sharma', password: 'Welcome@123',
    specialty: 'Cardiology', doctor_registration_no: 'MH-12345', qualifications: 'MBBS, MD',
    email: 'priya@hospital.com', phone: '9876543210',
    consultation_fee: '500', follow_up_fee: '300',
    working_hours: '09:00-17:00', slot_duration: '20', is_active: 'true',
  },
  service_master: {
    service_code: 'SVC-001', service_name: 'ICU Bed (General)', service_category: 'ICU',
    default_rate: '3500', hsn_sac_code: '9993', tax_rate: '5', is_active: 'true',
  },
  lab_test_master: {
    test_name: 'Complete Blood Count', price: '350', category: 'Haematology',
    sample_type: 'Blood', unit: 'g/dL', normal_range_min: '12', normal_range_max: '17',
    hsn_sac_code: '9993', tax_rate: '0', is_available: 'true',
  },
  package_master: {
    package_code: 'PKG-001', package_name: 'Appendectomy Package',
    description: 'Includes surgery, 3-day stay, meals',
    total_amount: '35000', validity_days: '7',
    exclusions: 'Blood products, implants', is_active: 'true',
  },
  medicine_master: {
    brand_name: 'Paracetamol 500mg', generic_name: 'Paracetamol', category: 'Analgesic',
    manufacturer: 'GSK', form: 'Tablet', strength: '500mg',
    mrp: '20', purchase_price: '8', selling_price: '15',
    gst_percent: '12', min_threshold: '10', hsn_sac_code: '3004', is_active: 'true',
  },
};

function triggerDownload(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadMasterTemplate(type: MasterImportType) {
  const headers = getTemplateHeaders(type);
  const sampleRow = SAMPLE_ROWS[type];
  // Only include keys that are in headers (in the correct order)
  const orderedSample: Record<string, string> = {};
  for (const h of headers) { orderedSample[h] = sampleRow[h] ?? ''; }
  const buffer = generateTemplateFile(headers, [orderedSample], 'xlsx');
  const label = type.replace('_master', '').replace('_', '-');
  triggerDownload(buffer, `${label}-master-template.xlsx`);
}
