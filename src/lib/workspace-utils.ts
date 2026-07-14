export type WorkspaceSelection = {
  organizationId: string | null
  workspaceId: string | null
}

export type TenantHeaderContext = {
  enabled: boolean
  activeOrganizationId?: string | null
  activeWorkspaceId?: string | null
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const WORKSPACE_SELECTION_STORAGE_KEY =
  "list_hygiene_workspace_selection"
export const WORKSPACE_ORGANIZATION_COOKIE = "lh_organization_id"
export const WORKSPACE_ID_COOKIE = "lh_workspace_id"
export const LEGACY_WORKSPACE_ID_STORAGE_KEY = "list-hygiene-workspace-id"

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export function isWorkspaceFrontendEnabled(
  value = process.env.NEXT_PUBLIC_ORG_WORKSPACES_ENABLED
) {
  return value !== "false"
}

export function buildDefaultOrganizationSlug(userId: string) {
  return `org-${userId.replace(/-/g, "")}`
}

export function buildDefaultOrganizationName({
  profileName,
  profileEmail,
  userEmail,
}: {
  profileName?: string | null
  profileEmail?: string | null
  userEmail?: string | null
}) {
  const trimmedProfileName = profileName?.trim()
  if (trimmedProfileName) {
    return trimmedProfileName
  }

  const email = profileEmail?.trim() || userEmail?.trim()
  const emailPrefix = email?.split("@")[0]?.trim()
  if (emailPrefix) {
    return emailPrefix
  }

  return "Default Organization"
}

export function serializeClientCookie(
  name: string,
  value: string | null,
  maxAgeSeconds = COOKIE_MAX_AGE_SECONDS
) {
  if (!value) {
    return `${name}=; Path=/; Max-Age=0; SameSite=Lax`
  }

  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
  ].join("; ")
}

export function readWorkspaceSelection(
  storage?: StorageLike
): WorkspaceSelection {
  if (!storage) {
    return { organizationId: null, workspaceId: null }
  }

  const raw = storage.getItem(WORKSPACE_SELECTION_STORAGE_KEY)
  if (!raw) {
    const legacyWorkspaceId = storage.getItem(LEGACY_WORKSPACE_ID_STORAGE_KEY)
    return { organizationId: null, workspaceId: legacyWorkspaceId }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceSelection>
    return {
      organizationId:
        typeof parsed.organizationId === "string"
          ? parsed.organizationId
          : null,
      workspaceId:
        typeof parsed.workspaceId === "string" ? parsed.workspaceId : null,
    }
  } catch {
    return { organizationId: null, workspaceId: null }
  }
}

export function writeWorkspaceSelection(
  selection: WorkspaceSelection,
  storage?: StorageLike
) {
  if (!storage) {
    return
  }

  storage.setItem(WORKSPACE_SELECTION_STORAGE_KEY, JSON.stringify(selection))
  if (selection.workspaceId) {
    storage.setItem(LEGACY_WORKSPACE_ID_STORAGE_KEY, selection.workspaceId)
  } else {
    storage.removeItem(LEGACY_WORKSPACE_ID_STORAGE_KEY)
  }
}

export function clearWorkspaceSelection(storage?: StorageLike) {
  storage?.removeItem(WORKSPACE_SELECTION_STORAGE_KEY)
  storage?.removeItem(LEGACY_WORKSPACE_ID_STORAGE_KEY)
}

export function clearWorkspaceClientState(
  storage?: StorageLike,
  setCookie?: (value: string) => void
) {
  clearWorkspaceSelection(storage)

  const writeCookie =
    setCookie ||
    ((value: string) => {
      if (typeof document !== "undefined") {
        document.cookie = value
      }
    })

  ;[WORKSPACE_ORGANIZATION_COOKIE, WORKSPACE_ID_COOKIE].forEach((cookieName) => {
    writeCookie(serializeClientCookie(cookieName, null))
  })
}

export function buildTenantHeaders(
  context: TenantHeaderContext,
  headers?: HeadersInit
) {
  const merged = new Headers(headers)

  if (!context.enabled || !context.activeOrganizationId) {
    return merged
  }

  merged.set("x-organization-id", context.activeOrganizationId)

  if (context.activeWorkspaceId) {
    merged.set("x-workspace-id", context.activeWorkspaceId)
  }

  return merged
}
