-- Migration: Storage RLS Policies for TrackErentory
-- Run this in your Supabase SQL Editor to allow file uploads to your storage buckets

-- 1. Ensure buckets are created and public
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('product-images', 'product-images', true),
  ('user-avatars', 'user-avatars', true),
  ('contract-docs', 'contract-docs', true),
  ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS "Public Storage Select" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Insert" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Delete" ON storage.objects;

-- 3. Create permissive storage policies for app file uploads
CREATE POLICY "Public Storage Select" ON storage.objects
  FOR SELECT TO public USING (true);

CREATE POLICY "Public Storage Insert" ON storage.objects
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Public Storage Update" ON storage.objects
  FOR UPDATE TO public USING (true);

CREATE POLICY "Public Storage Delete" ON storage.objects
  FOR DELETE TO public USING (true);
