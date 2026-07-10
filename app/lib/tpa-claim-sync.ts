// Keep the insurance_claims record in step with the invoice's TPA lifecycle.
//
// TPA state lives in two places: the invoice's tpa_* fields (advanced by the
// invoice-side flows — discharge-settlement approval and recordTpaPaymentReceived)
// and the insurance_claims row (advanced by the claim-side updateClaim). The
// invoice-side flows previously did NOT touch the claim row, so the claims list
// showed a stale "Submitted" while the bill was already Approved/Settled.
//
// syncClaimToInvoiceTpa forward-syncs the claim row to match the invoice. It is a
// no-op when the invoice has no linked claim (updateMany matches zero rows).

const CLAIM_STATUS_FOR_INVOICE: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  partially_settled: 'PartiallyApproved',
  settled: 'Settled',
  rejected: 'Rejected',
};

type TpaInvoiceLike = {
  id: number;
  tpa_claim_status?: string | null;
  tpa_approved_amount?: unknown;
  tpa_settled_amount?: unknown;
};

/**
 * Advance the invoice's linked insurance_claims row(s) to match the invoice's
 * current TPA status/amounts. Pass the tenant `db` or a transaction client.
 */
export async function syncClaimToInvoiceTpa(client: any, invoice: TpaInvoiceLike): Promise<void> {
  const status = CLAIM_STATUS_FOR_INVOICE[String(invoice.tpa_claim_status ?? '')];
  if (!status) return;

  const approved = Number(invoice.tpa_approved_amount || 0);
  const settled = Number(invoice.tpa_settled_amount || 0);

  const data: Record<string, unknown> = { status };
  if (approved > 0) data.approved_amount = approved;
  if (status === 'PartiallyApproved' || status === 'Settled') data.settled_amount = settled;

  await client.insurance_claims.updateMany({
    where: { invoice_id: invoice.id },
    data,
  });
}
