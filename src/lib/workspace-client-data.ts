"use client"

export type OrganizationOption = {
  id: string
  name: string
  role?: "owner" | "admin" | "member" | null
}

export type WorkspaceOption = {
  id: string
  organization_id: string
  name: string
  role?: "owner" | "admin" | "member" | null
  is_default?: boolean | null
  has_connected_account?: boolean
  has_active_billing?: boolean
  member_count?: number
}

type CacheEntry<T> = {
  data: T | null
  pending: Promise<T> | null
  updatedAt: number
}

export class ClientApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ClientApiError"
    this.status = status
  }
}

const CACHE_TTL_MS = 30_000

const organizationCache: CacheEntry<OrganizationOption[]> = {
  data: null,
  pending: null,
  updatedAt: 0,
}
const workspaceCaches = new Map<string, CacheEntry<WorkspaceOption[]>>()

function isFresh(updatedAt: number) {
  return Date.now() - updatedAt < CACHE_TTL_MS
}

async function responseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || response.statusText
  } catch {
    return response.statusText
  }
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  })

  if (!response.ok) {
    throw new ClientApiError(await responseErrorMessage(response), response.status)
  }

  return (await response.json()) as T
}

function workspaceCacheFor(organizationId: string) {
  const existing = workspaceCaches.get(organizationId)
  if (existing) {
    return existing
  }

  const next: CacheEntry<WorkspaceOption[]> = {
    data: null,
    pending: null,
    updatedAt: 0,
  }
  workspaceCaches.set(organizationId, next)

  return next
}

export async function loadOrganizations() {
  if (organizationCache.data && isFresh(organizationCache.updatedAt)) {
    return organizationCache.data
  }

  if (organizationCache.pending) {
    return organizationCache.pending
  }

  organizationCache.pending = fetchJson<OrganizationOption[]>("/api/organizations")
    .then((data) => {
      organizationCache.data = data
      organizationCache.updatedAt = Date.now()
      return data
    })
    .finally(() => {
      organizationCache.pending = null
    })

  return organizationCache.pending
}

export async function loadWorkspaces(organizationId: string) {
  const cache = workspaceCacheFor(organizationId)
  if (cache.data && isFresh(cache.updatedAt)) {
    return cache.data
  }

  if (cache.pending) {
    return cache.pending
  }

  const headers = new Headers()
  headers.set("x-organization-id", organizationId)

  cache.pending = fetchJson<WorkspaceOption[]>("/api/workspaces", {
    headers,
  })
    .then((data) => {
      cache.data = data
      cache.updatedAt = Date.now()
      return data
    })
    .finally(() => {
      cache.pending = null
    })

  return cache.pending
}

export function invalidateWorkspaceClientData(organizationId?: string | null) {
  organizationCache.updatedAt = 0

  if (organizationId) {
    workspaceCaches.delete(organizationId)
    return
  }

  workspaceCaches.clear()
}
