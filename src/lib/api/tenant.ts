import type { SupabaseClient, User } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
  buildDefaultOrganizationName,
  buildDefaultOrganizationSlug,
} from "@/lib/workspace-utils"

export type OrganizationRole = "owner" | "admin" | "member"

export type TenantContext = {
  user: User | null
  organizationId: string | null
  workspaceId: string | null
  role: OrganizationRole | null
  allowedWorkspaceIds: string[]
  legacyFallback: boolean
}

type JsonResponseInit = {
  status?: number
}

const selectOrganization = "id, name, slug, owner_user_id, created_at"
const selectWorkspace =
  "id, organization_id, name, slug, is_default, archived_at, created_at"

export function json(data: unknown, init?: JsonResponseInit) {
  return Response.json(data, init)
}

export function errorJson(message: string, status = 500) {
  return json({ error: message }, { status })
}

export function isFromPlasmicStudio(request: Request) {
  return Boolean(request.headers.get("x-plasmic-studio"))
}

export function orgWorkspacesEnabled() {
  return process.env.ORG_WORKSPACES_ENABLED !== "false"
}

export function orgContextRequired() {
  return process.env.ORG_CONTEXT_REQUIRED === "true"
}

export function canManageOrganization(role: OrganizationRole | null) {
  return role === "owner" || role === "admin"
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export function getRequestStringParam(request: Request, name: string) {
  const headerName = `x-${name.replaceAll("_", "-")}`
  const headerValue = request.headers.get(headerName)
  if (headerValue) {
    return headerValue
  }

  const url = new URL(request.url)
  const queryValue = url.searchParams.get(name)
  if (queryValue) {
    return queryValue
  }

  const cookieHeader = request.headers.get("cookie")
  if (!cookieHeader) {
    return null
  }

  const cookieName =
    name === "organization_id"
      ? WORKSPACE_ORGANIZATION_COOKIE
      : name === "workspace_id"
        ? WORKSPACE_ID_COOKIE
        : null

  if (!cookieName) {
    return null
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim())
  const cookie = cookies.find((value) => value.startsWith(`${cookieName}=`))

  return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null
}

export function hasTenantRequestScope(request: Request) {
  return Boolean(
    getRequestStringParam(request, "organization_id") ||
      getRequestStringParam(request, "workspace_id")
  )
}

export function shouldUseTenantContext(request: Request) {
  return orgWorkspacesEnabled() || hasTenantRequestScope(request)
}

export async function getDataClient() {
  try {
    return createAdminClient()
  } catch {
    return await createClient()
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export function makeSlug(value: string, fallback: string) {
  return `${slugify(value) || fallback}-${Date.now().toString(36)}`
}

export async function getOrCreateDefaultOrganization(
  supabase: SupabaseClient,
  user: User
): Promise<
  | {
      ok: true
      organization: {
        id: string
        name: string
        slug: string | null
        owner_user_id: string
        created_at: string
        role: OrganizationRole
      }
      workspace: {
        id: string
        organization_id: string
        name: string
        slug: string | null
        is_default: boolean | null
        archived_at?: string | null
        created_at: string
      }
    }
  | { ok: false; status: number; error: string }
> {
  const { data: profile } = await supabase
    .from("user_details")
    .select("name, email")
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .upsert(
      {
        legacy_user_id: user.id,
        owner_user_id: user.id,
        name: buildDefaultOrganizationName({
          profileName:
            typeof profile?.name === "string" ? profile.name : undefined,
          profileEmail:
            typeof profile?.email === "string" ? profile.email : undefined,
          userEmail: user.email,
        }),
        slug: buildDefaultOrganizationSlug(user.id),
      },
      { onConflict: "legacy_user_id" }
    )
    .select(selectOrganization)
    .single()

  if (organizationError || !organization) {
    return {
      ok: false,
      status: 500,
      error: organizationError?.message || "Unable to create organization",
    }
  }

  const organizationId = String(organization.id)

  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        role: "owner",
        status: "active",
      },
      { onConflict: "organization_id,user_id" }
    )

  if (memberError) {
    return { ok: false, status: 500, error: memberError.message }
  }

  const { data: existingWorkspace, error: workspaceLookupError } =
    await supabase
      .from("workspaces")
      .select(selectWorkspace)
      .eq("organization_id", organizationId)
      .eq("slug", "default")
      .maybeSingle()

  if (workspaceLookupError) {
    return { ok: false, status: 500, error: workspaceLookupError.message }
  }

  let workspace = existingWorkspace
  if (!workspace) {
    const { data: createdWorkspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        organization_id: organizationId,
        name: "Default Workspace",
        slug: "default",
        created_by_user_id: user.id,
        legacy_user_id: user.id,
        is_default: true,
      })
      .select(selectWorkspace)
      .single()

    if (workspaceError || !createdWorkspace) {
      return {
        ok: false,
        status: 500,
        error: workspaceError?.message || "Unable to create workspace",
      }
    }
    workspace = createdWorkspace
  }

  const { error: workspaceMemberError } = await supabase
    .from("workspace_members")
    .upsert(
      {
        organization_id: organizationId,
        workspace_id: String(workspace.id),
        user_id: user.id,
        role: "owner",
      },
      { onConflict: "workspace_id,user_id" }
    )

  if (workspaceMemberError) {
    return { ok: false, status: 500, error: workspaceMemberError.message }
  }

  return {
    ok: true,
    organization: {
      id: organizationId,
      name: String(organization.name),
      slug: typeof organization.slug === "string" ? organization.slug : null,
      owner_user_id: String(organization.owner_user_id),
      created_at: String(organization.created_at),
      role: "owner",
    },
    workspace: {
      id: String(workspace.id),
      organization_id: String(workspace.organization_id),
      name: String(workspace.name),
      slug: typeof workspace.slug === "string" ? workspace.slug : null,
      is_default:
        typeof workspace.is_default === "boolean"
          ? workspace.is_default
          : null,
      archived_at:
        typeof workspace.archived_at === "string"
          ? workspace.archived_at
          : null,
      created_at: String(workspace.created_at),
    },
  }
}

export async function resolveTenantContext(
  request: Request,
  options: { requireWorkspace?: boolean } = {}
): Promise<
  | { ok: true; context: TenantContext; supabase: SupabaseClient }
  | { ok: false; status: number; error: string }
> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" }
  }

  const shouldResolveTenant = shouldUseTenantContext(request)
  if (!shouldResolveTenant && !orgContextRequired()) {
    return {
      ok: true,
      supabase: await getDataClient(),
      context: {
        user,
        organizationId: null,
        workspaceId: null,
        role: null,
        allowedWorkspaceIds: [],
        legacyFallback: true,
      },
    }
  }

  const supabase = await getDataClient()
  const requestedOrganizationId = getRequestStringParam(
    request,
    "organization_id"
  )
  const requestedWorkspaceId = getRequestStringParam(request, "workspace_id")

  let membershipQuery = supabase
    .from("organization_members")
    .select("organization_id, role, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (requestedOrganizationId) {
    membershipQuery = membershipQuery.eq(
      "organization_id",
      requestedOrganizationId
    )
  }

  const { data: memberships, error: membershipError } = await membershipQuery
  const activeMemberships = memberships || []

  if (membershipError) {
    if (!orgContextRequired() && !hasTenantRequestScope(request)) {
      return {
        ok: true,
        supabase,
        context: {
          user,
          organizationId: null,
          workspaceId: null,
          role: null,
          allowedWorkspaceIds: [],
          legacyFallback: true,
        },
      }
    }

    return { ok: false, status: 500, error: membershipError.message }
  }

  if (!activeMemberships.length) {
    if (requestedOrganizationId) {
      return { ok: false, status: 403, error: "Organization access denied" }
    }

    const created = await getOrCreateDefaultOrganization(supabase, user)
    if (!created.ok) {
      return created
    }

    activeMemberships.push({
      organization_id: created.organization.id,
      role: "owner",
      status: "active",
      created_at: created.organization.created_at,
    })
  }

  const membership = activeMemberships[0]
  if (!membership) {
    return { ok: false, status: 403, error: "Organization access denied" }
  }

  const organizationId = String(membership.organization_id)
  const role = membership.role as OrganizationRole
  let allowedWorkspaceIds: string[] = []

  if (canManageOrganization(role)) {
    const { data: workspaces, error } = await supabase
      .from("workspaces")
      .select("id, is_default, created_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) {
      return { ok: false, status: 500, error: error.message }
    }

    allowedWorkspaceIds = (workspaces || []).map((workspace) =>
      String(workspace.id)
    )
  } else {
    const { data: workspaceMemberships, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)

    if (error) {
      return { ok: false, status: 500, error: error.message }
    }

    allowedWorkspaceIds = (workspaceMemberships || []).map((row) =>
      String(row.workspace_id)
    )
  }

  if (requestedWorkspaceId && !allowedWorkspaceIds.includes(requestedWorkspaceId)) {
    return { ok: false, status: 403, error: "Workspace access denied" }
  }

  const workspaceId = requestedWorkspaceId || allowedWorkspaceIds[0] || null
  if (options.requireWorkspace && !workspaceId) {
    return { ok: false, status: 403, error: "Workspace access required" }
  }

  return {
    ok: true,
    supabase,
    context: {
      user,
      organizationId,
      workspaceId,
      role,
      allowedWorkspaceIds,
      legacyFallback: false,
    },
  }
}

export async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}
