/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/backend/db';
import { assertReportAccess, MISAccessDeniedError } from './rbac';
import {
  dailyRevenueReport,
  billingDetailReport,
  billingItemDetailReport,
  billingSummaryReport,
  billingSummaryDetailReport,
  billingPaymentModeReport,
  billingUhidAdvanceReport,
  billingAdmissionAdvanceReport,
  billingDiscountSummaryReport,
  billingDueSettledReport,
  billingRefundReport,
  billingOpRefundReport,
  billingDateWiseCashReport,
  billingDoctorPayoutReport,
  billingDoctorAccountPayableReport,
  billingIpPackageReport,
  billingHealthCheckupCountReport,
  billingPayerAgreementExpiryReport,
  billingDepositRefundReport,
  billingPendingBillsReport,
  billingPaymentServiceTypeReport,
  billingPaymentSummaryReport,
  billingRevenueSummaryReport,
  billingCancelBillReport,
  billingServiceTypeSummaryReport
} from './registry/billing';
import {
  revenueDepartmentWiseReport,
  revenuePayerTypeWiseReport,
  revenuePayerNameWiseReport,
  revenueServiceTypeWiseReport,
  revenueBillingCategoryWiseReport,
  revenueWardWiseReport
} from './registry/revenue';
import {
  preRegistrationReport,
  registrationConvertReport,
  registrationReport,
  appointmentReport,
  doctorEventOffReport,
  doctorEventOffSummaryReport,
  appointmentTatReport,
  doctorFootfallReport,
  ipPatientReport,
  ipConversionReport,
  ipCancelReport,
  ipDischargeReport,
  erToIpConversionReport,
  bedStatusReport,
  admissionsListReport,
  emergencyAdmissionsReport,
  bedOccupancyReport,
  emergencyDischargeReport,
  bedTransferReport,
  doctorTransferReport,
  expiredPatientsReport,
  counsellingSummaryReport,
  dischargeTatReport
} from './registry/frontdesk';
import {
  diagCardiologyAppointmentReport,
  diagNeurologyAppointmentReport,
  diagNuclearMedicineAppointmentReport,
  diagPathologyAppointmentReport,
  diagPulmonologyAppointmentReport,
  diagRadiologyAppointmentReport,
  diagCardiologyServiceReport,
  diagNeurologyServiceReport,
  diagPulmonologyServiceReport,
  diagPathologyServiceReport,
  diagTatReport,
  diagPathologyTatReport,
  diagRadiologyTatReport,
  diagRadiologyServiceReport
} from './registry/diagnostic';
import {
  pharmacyIpIssueReport,
  pharmacyIpItemDetailReport,
  pharmacyOpItemDetailReport,
  pharmacyOpSummaryDetailReport,
  pharmacyIpDailyReport,
  pharmacyDailyIpReturnReport,
  pharmacyDailyIpIssueReport,
  pharmacyOpTaxSummaryReport,
  pharmacyOpTaxDetailsReport,
  pharmacyIpIssueWithTagsReport,
  pharmacyOpSaleWithTagsReport,
  pharmacyItemReorderLevelReport,
  pharmacySupplierListReport,
  pharmacyCurrentStockReport,
  pharmacyExpiryReport,
  pharmacyDoctorWiseSaleReport,
  pharmacyPatientPullOffReport,
  pharmacyDoctorPullOffReport,
  pharmacyIpPullOffReport,
  pharmacyOpSummaryReport,
  pharmacyOpSaleDetailReport,
  pharmacyOpReturnDetailReport,
  pharmacyHsnSummaryReport,
  pharmacySettlementReport,
  pharmacyDoctorWiseDetailReport
} from './registry/pharmacy';
import {
  inventoryStockReport,
  inventoryItemWiseStockReport,
  inventoryGrnSummaryReport,
  inventoryGrnReturnSummaryReport,
  inventoryItemMasterReport,
  inventoryGrnDetailReport,
  inventoryGrnReturnDetailReport,
  inventoryStoreToStoreIssueReport,
  inventoryBatchInflowOutflowReport,
  inventoryAsOnDateStockReport,
  inventoryHsnTaxSummaryReport,
  inventoryBinCardBatchReport,
  inventoryBinCardItemReport,
  inventoryMovingItemsReport,
  inventoryGrnPendingCnReport,
  inventoryStoreConsumptionReport
} from './registry/inventory';
import {
  otBookingDetailsReport,
  otSurgeryDetailsReport,
  otSurgeryTatReport,
  ambulanceOrdersReport,
  ambulanceRequestReport,
  ambulanceTatReport,
  opticalItemBillingReport,
  opticalProductBillingReport,
  opticalDailySettlementReport,
  opticalDailySettlementSumReport,
  opticalPaymentReport
} from './registry/specialized';
import { ValidatedFilters, ReportDefinition } from './types';

// Add all reports to this registry map
export const REGISTRY: Record<string, ReportDefinition> = {
  [dailyRevenueReport.id]: dailyRevenueReport,
  [billingDetailReport.id]: billingDetailReport,
  [billingItemDetailReport.id]: billingItemDetailReport,
  [billingSummaryReport.id]: billingSummaryReport,
  [billingSummaryDetailReport.id]: billingSummaryDetailReport,
  [billingPaymentModeReport.id]: billingPaymentModeReport,
  [billingUhidAdvanceReport.id]: billingUhidAdvanceReport,
  [billingAdmissionAdvanceReport.id]: billingAdmissionAdvanceReport,
  [billingDiscountSummaryReport.id]: billingDiscountSummaryReport,
  [billingDueSettledReport.id]: billingDueSettledReport,
  [billingRefundReport.id]: billingRefundReport,
  [billingOpRefundReport.id]: billingOpRefundReport,
  [billingDateWiseCashReport.id]: billingDateWiseCashReport,
  [billingDoctorPayoutReport.id]: billingDoctorPayoutReport,
  [billingDoctorAccountPayableReport.id]: billingDoctorAccountPayableReport,
  [billingIpPackageReport.id]: billingIpPackageReport,
  [billingHealthCheckupCountReport.id]: billingHealthCheckupCountReport,
  [billingPayerAgreementExpiryReport.id]: billingPayerAgreementExpiryReport,
  [billingDepositRefundReport.id]: billingDepositRefundReport,
  [billingPendingBillsReport.id]: billingPendingBillsReport,
  [billingPaymentServiceTypeReport.id]: billingPaymentServiceTypeReport,
  [billingPaymentSummaryReport.id]: billingPaymentSummaryReport,
  [billingRevenueSummaryReport.id]: billingRevenueSummaryReport,
  [billingCancelBillReport.id]: billingCancelBillReport,
  [billingServiceTypeSummaryReport.id]: billingServiceTypeSummaryReport,
  [revenueDepartmentWiseReport.id]: revenueDepartmentWiseReport,
  [revenuePayerTypeWiseReport.id]: revenuePayerTypeWiseReport,
  [revenuePayerNameWiseReport.id]: revenuePayerNameWiseReport,
  [revenueServiceTypeWiseReport.id]: revenueServiceTypeWiseReport,
  [revenueBillingCategoryWiseReport.id]: revenueBillingCategoryWiseReport,
  [revenueWardWiseReport.id]: revenueWardWiseReport,
  [preRegistrationReport.id]: preRegistrationReport,
  [registrationConvertReport.id]: registrationConvertReport,
  [registrationReport.id]: registrationReport,
  [appointmentReport.id]: appointmentReport,
  [doctorEventOffReport.id]: doctorEventOffReport,
  [doctorEventOffSummaryReport.id]: doctorEventOffSummaryReport,
  [appointmentTatReport.id]: appointmentTatReport,
  [doctorFootfallReport.id]: doctorFootfallReport,
  [ipPatientReport.id]: ipPatientReport,
  [ipConversionReport.id]: ipConversionReport,
  [ipCancelReport.id]: ipCancelReport,
  [ipDischargeReport.id]: ipDischargeReport,
  [erToIpConversionReport.id]: erToIpConversionReport,
  [bedStatusReport.id]: bedStatusReport,
  [admissionsListReport.id]: admissionsListReport,
  [emergencyAdmissionsReport.id]: emergencyAdmissionsReport,
  [bedOccupancyReport.id]: bedOccupancyReport,
  [emergencyDischargeReport.id]: emergencyDischargeReport,
  [bedTransferReport.id]: bedTransferReport,
  [doctorTransferReport.id]: doctorTransferReport,
  [expiredPatientsReport.id]: expiredPatientsReport,
  [counsellingSummaryReport.id]: counsellingSummaryReport,
  [dischargeTatReport.id]: dischargeTatReport,
  [diagCardiologyAppointmentReport.id]: diagCardiologyAppointmentReport,
  [diagNeurologyAppointmentReport.id]: diagNeurologyAppointmentReport,
  [diagNuclearMedicineAppointmentReport.id]: diagNuclearMedicineAppointmentReport,
  [diagPathologyAppointmentReport.id]: diagPathologyAppointmentReport,
  [diagPulmonologyAppointmentReport.id]: diagPulmonologyAppointmentReport,
  [diagRadiologyAppointmentReport.id]: diagRadiologyAppointmentReport,
  [diagCardiologyServiceReport.id]: diagCardiologyServiceReport,
  [diagNeurologyServiceReport.id]: diagNeurologyServiceReport,
  [diagPulmonologyServiceReport.id]: diagPulmonologyServiceReport,
  [diagPathologyServiceReport.id]: diagPathologyServiceReport,
  [diagTatReport.id]: diagTatReport,
  [diagPathologyTatReport.id]: diagPathologyTatReport,
  [diagRadiologyTatReport.id]: diagRadiologyTatReport,
  [pharmacyIpIssueReport.id]: pharmacyIpIssueReport,
  [pharmacyIpItemDetailReport.id]: pharmacyIpItemDetailReport,
  [pharmacyOpItemDetailReport.id]: pharmacyOpItemDetailReport,
  [pharmacyOpSummaryDetailReport.id]: pharmacyOpSummaryDetailReport,
  [pharmacyIpDailyReport.id]: pharmacyIpDailyReport,
  [pharmacyDailyIpReturnReport.id]: pharmacyDailyIpReturnReport,
  [pharmacyDailyIpIssueReport.id]: pharmacyDailyIpIssueReport,
  [pharmacyOpTaxSummaryReport.id]: pharmacyOpTaxSummaryReport,
  [pharmacyOpTaxDetailsReport.id]: pharmacyOpTaxDetailsReport,
  [pharmacyIpIssueWithTagsReport.id]: pharmacyIpIssueWithTagsReport,
  [pharmacyOpSaleWithTagsReport.id]: pharmacyOpSaleWithTagsReport,
  [pharmacyItemReorderLevelReport.id]: pharmacyItemReorderLevelReport,
  [pharmacySupplierListReport.id]: pharmacySupplierListReport,
  [pharmacyCurrentStockReport.id]: pharmacyCurrentStockReport,
  [pharmacyExpiryReport.id]: pharmacyExpiryReport,
  [pharmacyDoctorWiseSaleReport.id]: pharmacyDoctorWiseSaleReport,
  [pharmacyPatientPullOffReport.id]: pharmacyPatientPullOffReport,
  [pharmacyDoctorPullOffReport.id]: pharmacyDoctorPullOffReport,
  [pharmacyIpPullOffReport.id]: pharmacyIpPullOffReport,
  [inventoryStockReport.id]: inventoryStockReport,
  [inventoryItemWiseStockReport.id]: inventoryItemWiseStockReport,
  [inventoryGrnSummaryReport.id]: inventoryGrnSummaryReport,
  [inventoryGrnReturnSummaryReport.id]: inventoryGrnReturnSummaryReport,
  [inventoryItemMasterReport.id]: inventoryItemMasterReport,
  [inventoryGrnDetailReport.id]: inventoryGrnDetailReport,
  [inventoryGrnReturnDetailReport.id]: inventoryGrnReturnDetailReport,
  [inventoryStoreToStoreIssueReport.id]: inventoryStoreToStoreIssueReport,
  [inventoryBatchInflowOutflowReport.id]: inventoryBatchInflowOutflowReport,
  [inventoryAsOnDateStockReport.id]: inventoryAsOnDateStockReport,
  [inventoryHsnTaxSummaryReport.id]: inventoryHsnTaxSummaryReport,
  [inventoryBinCardBatchReport.id]: inventoryBinCardBatchReport,
  [inventoryBinCardItemReport.id]: inventoryBinCardItemReport,
  [inventoryMovingItemsReport.id]: inventoryMovingItemsReport,
  [inventoryGrnPendingCnReport.id]: inventoryGrnPendingCnReport,
  [inventoryStoreConsumptionReport.id]: inventoryStoreConsumptionReport,
  [otBookingDetailsReport.id]: otBookingDetailsReport,
  [otSurgeryDetailsReport.id]: otSurgeryDetailsReport,
  [otSurgeryTatReport.id]: otSurgeryTatReport,
  [ambulanceOrdersReport.id]: ambulanceOrdersReport,
  [ambulanceRequestReport.id]: ambulanceRequestReport,
  [ambulanceTatReport.id]: ambulanceTatReport,
  [opticalItemBillingReport.id]: opticalItemBillingReport,
  [opticalProductBillingReport.id]: opticalProductBillingReport,
  [opticalDailySettlementReport.id]: opticalDailySettlementReport,
  [opticalDailySettlementSumReport.id]: opticalDailySettlementSumReport,
  [opticalPaymentReport.id]: opticalPaymentReport,
  [pharmacyOpSummaryReport.id]: pharmacyOpSummaryReport,
  [pharmacyOpSaleDetailReport.id]: pharmacyOpSaleDetailReport,
  [pharmacyOpReturnDetailReport.id]: pharmacyOpReturnDetailReport,
  [pharmacyHsnSummaryReport.id]: pharmacyHsnSummaryReport,
  [pharmacySettlementReport.id]: pharmacySettlementReport,
  [pharmacyDoctorWiseDetailReport.id]: pharmacyDoctorWiseDetailReport,
  [diagRadiologyServiceReport.id]: diagRadiologyServiceReport,
};

export async function runReport(
  reportId: string,
  rawFilters: unknown,
  orgId: string,
  userId: string,
  userPermissions: string[]
) {
  const reportDef = REGISTRY[reportId];
  if (!reportDef) {
    throw new Error(`Report ${reportId} not found`);
  }

  // 1. Check permissions — throws MISAccessDeniedError if the user's role
  //    does not include the report's requiredPermission.
  assertReportAccess(reportDef.requiredPermission, userPermissions);

  // 2. Validate filters
  const parsedFilters = reportDef.filters.safeParse(rawFilters);
  if (!parsedFilters.success) {
    throw new Error(`Invalid filters: ${parsedFilters.error.message}`);
  }

  const filters = parsedFilters.data as ValidatedFilters;

  // ── 3. Row-count check: countFn path vs. sync-execute-and-check path ──────
  //
  // ## Strategy
  //
  //   A. countFn defined (large detail reports)
  //      Call the fast COUNT(*) query to estimate result size BEFORE running
  //      the full query. If the count exceeds rowLimitSync, queue a background
  //      job immediately — we never load the full result set into memory.
  //
  //   B. countFn absent (aggregated/summary reports)
  //      Execute queryFn synchronously. Summary reports (GROUP BY ...) always
  //      return O(hundreds) of grouped rows, so the result is safe to load.
  //      After execution, check rows.length — if it somehow exceeds the limit,
  //      this indicates the report definition needs a countFn added.
  //      In practice this path will never queue async because grouped reports
  //      cannot exceed rowLimitSync (5000 grouped buckets = enormous date range).
  //
  // ## Why NOT always run the query and check rows.length
  //   For row-level detail reports (billing-detail, pharmacy-ip-item-detail),
  //   a naive query fetch of 100,000 rows into Node.js memory before deciding
  //   "this should have been async" is an OOM risk and a slow response time.
  //   countFn prevents this by paying only one cheap COUNT(*) round-trip.

  if (reportDef.countFn) {
    // ── Path A: cheap COUNT(*) pre-check ───────────────────────────────────
    let estimatedRowCount: number;
    try {
      estimatedRowCount = await reportDef.countFn(filters, orgId);
    } catch (countErr: any) {
      // If the count query fails (e.g., table not yet migrated), log the error
      // and fall through to sync execution rather than silently queuing async.
      // This is the safer failure mode.
      console.warn(
        `[MIS Runner] countFn for "${reportId}" failed — falling through to sync execution.`,
        countErr?.message
      );
      estimatedRowCount = 0;
    }

    if (estimatedRowCount > reportDef.rowLimitSync) {
      // Queue a background Excel job. The worker (app/api/mis/worker/route.ts)
      // will pick this up, call queryFn, generate the Excel buffer, and mark
      // the job Completed with a file_key.
      //
      // format is always 'Excel' — the worker always produces .xlsx output.
      // The previous runner used 'JSON' here, which was incorrect.
      const job = await prisma.report_jobs.create({
        data: {
          id: randomUUID(),
          report_id: reportId,
          filters_json: filters as Prisma.InputJsonValue,
          requested_by: userId,
          organizationId: orgId,
          format: 'Excel',
          status: 'Queued',
        },
      });

      console.info(
        `[MIS Runner] "${reportId}" estimated ${estimatedRowCount} rows > ` +
        `rowLimitSync(${reportDef.rowLimitSync}). Queued job ${job.id}.`
      );

      return { async: true, jobId: job.id };
    }

    // Count is within limit — fall through to sync execution below.
  }

  // ── Path B (or Path A within-limit): Sync execution ────────────────────
  const { rows, totals } = await reportDef.queryFn(filters, orgId);

  // Post-hoc check for reports without countFn: if the actual row count
  // exceeds the sync limit, log a warning. The data is returned synchronously
  // this time (it's already in memory), but operators should add countFn to
  // the report definition to avoid this in future runs.
  if (rows.length > reportDef.rowLimitSync) {
    console.warn(
      `[MIS Runner] "${reportId}" returned ${rows.length} rows synchronously, ` +
      `which exceeds rowLimitSync(${reportDef.rowLimitSync}). ` +
      `Add a countFn to this report definition to enable async routing.`
    );
  }

  // 4. Log access
  await prisma.report_access_logs.create({
    data: {
      id: randomUUID(),
      user_id: userId,
      report_id: reportId,
      filters_json: filters as Prisma.InputJsonValue,
      row_count: rows.length,
      action: 'MIS_GENERATE',
      organizationId: orgId,
    },
  });

  return {
    async: false,
    rows,
    totals,
    meta: {
      generatedAt: new Date(),
      reportName: reportDef.name,
      rowCount: rows.length,
    },
  };
}

