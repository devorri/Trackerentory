import { supabase, BUCKET_PRODUCT_IMAGES, BUCKET_DOCUMENTS } from './supabase'

/** Upload an image to a public bucket and return its public URL. */
export async function uploadPublicImage(
  bucket: string,
  file: File,
  folder = '',
): Promise<{ url: string | null; error: string | null }> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${folder ? `${folder}/` : ''}${Date.now()}_${safeName}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })

  if (error) return { url: null, error: error.message }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}

// Convenience wrappers for common buckets
export const uploadProductImage = (file: File, folder = '') => uploadPublicImage(BUCKET_PRODUCT_IMAGES, file, folder)
export const uploadDocument = (file: File, folder = '') => uploadPublicImage(BUCKET_DOCUMENTS, file, folder)

/**
 * Get a signed URL for a private object. Expires in `expires` seconds (default 300).
 */
export async function getSignedUrl(bucket: string, path: string, expires = 300): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expires)
  if (error) return { url: null, error: error.message }
  return { url: data?.signedUrl || null, error: null }
}

/** Remove an object from a bucket. */
export async function removeFile(bucket: string, path: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  return { error: error ? error.message : null }
}
