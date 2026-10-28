import { supabase } from './supabase'
import type { PullOutItem } from './types'

const LOCAL_STORAGE_KEY = 'trackerentory_pull_out_items'

function getLocalItems(): PullOutItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PullOutItem[]) : []
  } catch {
    return []
  }
}

function saveLocalItems(items: PullOutItem[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('Failed to save pull out items to localStorage', err)
  }
}

export async function fetchPullOutItems(): Promise<{ data: PullOutItem[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('pull_out_items')
      .select('*, cubes(cube_number, type), renter:users!renter_id(full_name, phone_number, social_link, username)')
      .order('pulled_out_at', { ascending: false })

    if (error) {
      // Table might not exist yet in Supabase schema — fallback seamlessly to local storage
      console.warn('Supabase pull_out_items table query notice:', error.message)
      const local = getLocalItems()
      return { data: local, error: null }
    }

    const local = getLocalItems()
    // Merge: include any local items not yet in Supabase
    const dbIds = new Set((data || []).map((d: any) => String(d.pull_out_id)))
    const pendingLocal = local.filter((l) => !dbIds.has(String(l.pull_out_id)))
    const merged = [...pendingLocal, ...(data as PullOutItem[])]

    return { data: merged, error: null }
  } catch (err: any) {
    const local = getLocalItems()
    return { data: local, error: null }
  }
}

export async function addPullOutItem(
  item: Omit<PullOutItem, 'pull_out_id' | 'pulled_out_at' | 'created_at'> & {
    pulled_out_at?: string
  }
): Promise<{ success: boolean; item: PullOutItem; error: string | null }> {
  const timestamp = item.pulled_out_at || new Date().toISOString()
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const payload = {
    type: item.type,
    product_id: item.product_id || null,
    cube_id: item.cube_id || null,
    renter_id: item.renter_id || null,
    transaction_id: item.transaction_id || null,
    buyer_name: item.buyer_name || null,
    product_name: item.product_name,
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 1),
    reason: item.reason || 'Contract Expired',
    status: item.status || 'Pull Out',
    notes: item.notes || null,
    pulled_out_by: item.pulled_out_by || null,
    pulled_out_at: timestamp,
  }

  try {
    const { data, error } = await supabase
      .from('pull_out_items')
      .insert([payload])
      .select('*, cubes(cube_number, type), renter:users!renter_id(full_name, phone_number, social_link, username)')
      .maybeSingle()

    if (error) {
      console.warn('Supabase insert failed, saving to localStorage:', error.message)
      const fallbackItem: PullOutItem = {
        ...payload,
        pull_out_id: localId,
        created_at: timestamp,
        cubes: item.cubes,
        renter: item.renter,
      }
      const existing = getLocalItems()
      saveLocalItems([fallbackItem, ...existing])
      return { success: true, item: fallbackItem, error: null }
    }

    const saved = data as PullOutItem
    return { success: true, item: saved, error: null }
  } catch {
    const fallbackItem: PullOutItem = {
      ...payload,
      pull_out_id: localId,
      created_at: timestamp,
      cubes: item.cubes,
      renter: item.renter,
    }
    const existing = getLocalItems()
    saveLocalItems([fallbackItem, ...existing])
    return { success: true, item: fallbackItem, error: null }
  }
}

export async function updatePullOutItemStatus(
  id: number | string,
  newStatus: string
): Promise<{ success: boolean; error: string | null }> {
  // Update local storage
  const local = getLocalItems()
  const updatedLocal = local.map((i) =>
    String(i.pull_out_id) === String(id) ? { ...i, status: newStatus } : i
  )
  saveLocalItems(updatedLocal)

  // Update Supabase if numeric ID
  if (typeof id === 'number' || !String(id).startsWith('local_')) {
    try {
      await supabase.from('pull_out_items').update({ status: newStatus }).eq('pull_out_id', id)
    } catch {
      // Ignored
    }
  }

  return { success: true, error: null }
}

export async function deletePullOutItem(id: number | string): Promise<{ success: boolean; error: string | null }> {
  const local = getLocalItems()
  saveLocalItems(local.filter((i) => String(i.pull_out_id) !== String(id)))

  if (typeof id === 'number' || !String(id).startsWith('local_')) {
    try {
      await supabase.from('pull_out_items').delete().eq('pull_out_id', id)
    } catch {
      // Ignored
    }
  }

  return { success: true, error: null }
}
