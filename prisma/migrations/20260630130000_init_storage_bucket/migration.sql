-- Provision the private "ticket-attachments" Supabase Storage bucket + RLS policies.
-- Idempotent: safe to re-run without failing `migrate deploy`.

-- 1. Private bucket (public = false -> access only via RLS + signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Access policies on storage.objects, scoped strictly to this bucket.
--    Authenticated users may read/write objects in the ticket-attachments bucket.

DROP POLICY IF EXISTS "ticket_attachments_authenticated_select" ON storage.objects;
CREATE POLICY "ticket_attachments_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "ticket_attachments_authenticated_insert" ON storage.objects;
CREATE POLICY "ticket_attachments_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "ticket_attachments_authenticated_update" ON storage.objects;
CREATE POLICY "ticket_attachments_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'ticket-attachments')
  WITH CHECK (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "ticket_attachments_authenticated_delete" ON storage.objects;
CREATE POLICY "ticket_attachments_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ticket-attachments');
