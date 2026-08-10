-- 003_fix_storage_rls.sql
-- Restrict tenant-assets uploads to tenant_admin and super_admin only.

DROP POLICY IF EXISTS "Authenticated upload tenant assets" ON storage.objects;

CREATE POLICY "Tenant admin upload tenant assets" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('tenant_admin', 'super_admin')
    )
  );
