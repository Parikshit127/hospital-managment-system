import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { lookupBarcode } from '@/app/actions/inventory-analytics-actions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const auth = await resolveRouteAuth({
    allowedStaffRoles: [
      'admin',
      'store_manager',
      'procurement_officer',
      'finance',
      'nurse',
      'lab_technician',
      'ipd_manager',
      'opd_manager',
      'pharmacist',
    ],
  });
  if (!auth.ok) return auth.response;

  const { code } = await params;
  const result = await lookupBarcode(code);
  if (!result.success) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
