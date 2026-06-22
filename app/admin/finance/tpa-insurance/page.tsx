// Unified TPA & Insurance module.
// Both /insurance and /admin/finance/tpa-insurance render the SAME module so the
// full picture (providers, policies, pre-auths, claims, leakage + receivables,
// receipts, outstanding/aging, bill-wise sanction) is available in one place,
// in finance as well as admin. AppShell adapts the chrome by route.
export { default } from '@/app/insurance/page';
