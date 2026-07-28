"use client"

import { invalidateWorkspaceClientData } from "@/lib/workspace-client-data"
import { clearWorkspaceClientState } from "@/lib/workspace-utils"

type BrowserStorage = Storage & {
  key(index: number): string | null
}

const SUPABASE_LEGACY_STORAGE_KEYS = ["supabase.auth.token"]

function isSupabaseAuthStorageKey(key: string) {
  return key.startsWith("sb-") && key.includes("auth-token")
}

function clearSupabaseAuthStorage(storage: BrowserStorage | undefined) {
  if (!storage) {
    return
  }

  SUPABASE_LEGACY_STORAGE_KEYS.forEach((key) => {
    storage.removeItem(key)
  })

  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && isSupabaseAuthStorageKey(key)) {
      keys.push(key)
    }
  }

  keys.forEach((key) => {
    storage.removeItem(key)
  })
}

export function clearPreviousUserClientData() {
  if (typeof window === "undefined") {
    return
  }

  clearWorkspaceClientState(window.localStorage)
  invalidateWorkspaceClientData()
  clearSupabaseAuthStorage(window.localStorage)
  clearSupabaseAuthStorage(window.sessionStorage)
}
