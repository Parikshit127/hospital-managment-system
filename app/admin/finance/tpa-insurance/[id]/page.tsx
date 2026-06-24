// Provider detail page for the admin finance portal. Renders the same dedicated
// provider page as /insurance/provider/[id] but keeps the URL under
// /admin/finance/tpa-insurance/* so the admin stays in the finance portal chrome
// instead of switching context. The page reads its provider id from the [id] param.
export { default } from '@/app/insurance/provider/[id]/page';
