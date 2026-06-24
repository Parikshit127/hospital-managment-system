// Reception's IPD Patient Chart. Renders the single canonical chart component
// (same as /ipd/admission/[id]) but keeps the URL under /reception/* so the
// receptionist (and an admin browsing reception) stays in the reception portal
// sidebar instead of being switched into the IPD Manager portal. The chart reads
// its admission id from the [id] route param, which matches here.
export { default } from '@/app/ipd/admission/[id]/page';
