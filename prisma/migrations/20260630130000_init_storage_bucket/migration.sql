-- Provision the private "ticket-attachments" Supabase Storage bucket + RLS policies.
--
-- Supabase-only: `storage.buckets` / `storage.objects` and the `authenticated`
-- role are created by Supabase's Storage extension and do NOT exist on plain
-- PostgreSQL (e.g. AWS RDS). Guard the whole block on the `storage` schema being
-- present so this migration is a harmless no-op on non-Supabase databases and a
-- full provision on Supabase. Idempotent on both (safe to re-run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
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
  END IF;
END $$;
