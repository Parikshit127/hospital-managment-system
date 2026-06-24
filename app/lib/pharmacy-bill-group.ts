// Shared grouping for IPD pharmacy "bills".
//
// When pharmacy dispenses to an admitted patient, every medicine of one
// dispensing is posted as an invoice_item on the IPD invoice sharing the same
// created_at timestamp. A "bill" (one dispensing event) is therefore the set of
// pharmacy line items that share their created_at down to the minute.
//
// Customer Invoices uses this to show each dispensing as its own row (3 times in
// a day → 3 rows), while the discharge / master bill groups the same items by
// DAY. Both run server-side so the timestamp is read in a single, consistent
// timezone.
export function dispensingKey(d: Date | string): string {
    const t = new Date(d);
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}-${t.getMinutes()}`;
}
