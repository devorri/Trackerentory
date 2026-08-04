import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://rovetvwdtpsdghnnepoe.supabase.co'
const anon =
	import.meta.env.VITE_SUPABASE_ANON_KEY ||
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvdmV0dndkdHBzZGdobm5lcG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjU5MTMsImV4cCI6MjA5NTU0MTkxM30.rUOZr81twmOlXqivO_ovcWi2P8_4MK1K_2kFbR7feDs'

export const isSupabaseConfigured = Boolean(url && anon)

export const supabaseConfigError = isSupabaseConfigured
	? null
	: 'Supabase env vars are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env in the project root, then restart npm run dev.'

if (!isSupabaseConfigured) {
	// eslint-disable-next-line no-console
	console.error(supabaseConfigError)
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'missing-anon-key')

export type SupabaseConnectionStatus = 'checking' | 'connected' | 'disconnected'

export function getSupabaseConnectionLabel(status: SupabaseConnectionStatus) {
	if (status === 'connected') return 'Supabase connected'
	if (status === 'checking') return 'Checking Supabase…'
	return 'Supabase disconnected'
}

/** Turn Supabase/PostgREST errors into a short user-facing message. */
export function formatSupabaseError(error: { message?: string; code?: string; hint?: string } | null) {
	if (!error) return null
	if (error.code === '42501') {
		return 'Database permissions are not configured. In Supabase SQL Editor, run docs/supabase-table-grants.sql.'
	}
	return error.hint ? `${error.message} (${error.hint})` : (error.message ?? 'Request failed')
}

// Supabase bucket names (use the buckets you've already created)
export const BUCKET_PRODUCT_IMAGES = 'product-images'
export const BUCKET_USER_AVATARS = 'user-avatars'
export const BUCKET_CONTRACT_DOCS = 'contract-docs'
export const BUCKET_DOCUMENTS = 'documents'

// Helpful prefixes (use these when building object keys)
export const PREFIX_PRODUCTS = 'products/'
export const PREFIX_AVATARS = 'avatars/'
export const PREFIX_CONTRACTS = 'contracts/'
export const PREFIX_DOCUMENTS = 'documents/'
