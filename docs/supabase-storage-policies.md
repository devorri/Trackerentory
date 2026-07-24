# Supabase Storage Policies & Recommended Settings

This document contains recommended bucket settings, access rules, and SQL snippets you can paste into your Supabase project's SQL editor. These are guidelines — adapt paths and auth strategies to your project.

## Bucket mapping (current)
- `product-images` — public (display images)
- `user-avatars` — public (profile photos)
- `contract-docs` — private (signed contracts)
- `documents` — private (receipts, attachments, backups)

## Recommendations
- Keep public buckets (`product-images`, `user-avatars`) public for simple `getPublicUrl` usage.
- Keep `contract-docs` and `documents` private; always serve via signed URLs using `createSignedUrl` to avoid exposing sensitive files.
- Use consistent prefixes within private buckets that include resource or user identifiers, e.g. `documents/{userId}/...` or `contracts/{contractId}/...`.

## Supabase SQL snippets (examples)

### 1) Example: allow only authenticated users to upload to `documents` bucket
This policy assumes you store the uploader's `auth.uid()` in the object's metadata as `owner_uid` when uploading (you can add metadata in the upload request).

```sql
-- Allow authenticated users to insert objects with their own uid in metadata
CREATE POLICY "documents_insert_authenticated_owner" ON storage.objects
FOR INSERT USING (
  auth.role() = 'authenticated' AND (metadata->>'owner_uid')::text = auth.uid()
);

-- Allow object select for the owner
CREATE POLICY "documents_select_owner" ON storage.objects
FOR SELECT USING (
  auth.role() = 'authenticated' AND (metadata->>'owner_uid')::text = auth.uid()
);

-- Allow delete for the owner
CREATE POLICY "documents_delete_owner" ON storage.objects
FOR DELETE USING (
  auth.role() = 'authenticated' AND (metadata->>'owner_uid')::text = auth.uid()
);
```

Note: Supabase's `storage.objects` table has columns: `id, name, bucket_id, metadata, updated_at, created_at, last_accessed_at, owner`.

### 2) Simpler approach: restrict by path prefix
If you name files with the UID as the leading path (e.g. `documents/{uid}/...`), you can allow access when `split_part(name, '/', 1) = auth.uid()`:

```sql
CREATE POLICY "documents_select_by_path_owner" ON storage.objects
FOR SELECT USING (
  auth.role() = 'authenticated' AND split_part(name, '/', 1) = auth.uid()
);
```

### 3) Admin / Owner access
If you have an admin role in your `users` table, allow them to bypass checks by checking `auth.role()` or by adding `OR EXISTS (SELECT 1 FROM public.users u WHERE u.uid = auth.uid() AND u.role = 'Owner')`.

## How to apply
1. Open Supabase Dashboard → SQL Editor.
2. Paste the adapted SQL snippet and run.
3. Test using the Supabase client: try uploading as an authenticated user and fetching a signed URL.

## Notes & caveats
- `auth.uid()` returns the authenticated user's UUID from Supabase Auth. If your app stores integer `user_id` values in a separate `users` table, you need a mapping from `auth.uid()` to your `users.user_id`.
- Policies that inspect `metadata` require that you set metadata during upload. The Supabase JS client supports passing `upsert` and `cacheControl` options; metadata can be included in some SDKs via `options` or by writing a small server-side helper.
- If policies are too complex, prefer keeping buckets private and serving files only via server-side signed URLs.

If you want, I can:
- Generate the exact SQL tailored to your auth/user schema (send how you map `auth.uid()` to `users.user_id`).
- Add client-side metadata when uploading files so RLS policies can rely on `metadata->>'owner_uid'`.
- Create serverless endpoints to generate signed URLs instead of calling `createSignedUrl` from the client.
