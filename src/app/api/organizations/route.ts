import {
  errorJson,
  getCurrentUser,
  getDataClient,
  getOrCreateDefaultOrganization,
  json,
  makeSlug,
  readJsonBody,
} from "@/lib/api/tenant"
import {
  isDirectDatabaseConfigured,
  queryRows,
} from "@/lib/db/postgres"

const selectOrganization = "id, name, slug, owner_user_id, created_at"
const selectWorkspace = "id, organization_id, name, slug, is_default, created_at"

type OrganizationRow = {
  id: string
  name: string
  slug: string | null
  owner_user_id: string
  created_at: string
  role: "owner" | "admin" | "member" | null
}

async function getOrganizationsFromPostgres(user: {
  id: string
  email?: string | null
}) {
  let organizations = await queryRows<OrganizationRow>(
    `
      select
        o.id::text,
        o.name,
        o.slug,
        o.owner_user_id::text,
        o.created_at::text,
        om.role
      from public.organization_members om
      join public.organizations o on o.id = om.organization_id
      where om.user_id = $1::uuid
        and om.status = 'active'
      order by om.created_at asc, o.created_at asc
    `,
    [user.id]
  )

  if (!organizations.length) {
    await queryRows(
      "select public.ensure_default_organization_workspace($1::uuid, $2::text, '{}'::jsonb)",
      [user.id, user.email || ""]
    )

    organizations = await queryRows<OrganizationRow>(
      `
        select
          o.id::text,
          o.name,
          o.slug,
          o.owner_user_id::text,
          o.created_at::text,
          om.role
        from public.organization_members om
        join public.organizations o on o.id = om.organization_id
        where om.user_id = $1::uuid
          and om.status = 'active'
        order by om.created_at asc, o.created_at asc
      `,
      [user.id]
    )
  }

  return organizations
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    console.warn("Organizations GET failed: not authenticated")
    return errorJson("Not authenticated", 401)
  }

  if (isDirectDatabaseConfigured()) {
    try {
      return json(await getOrganizationsFromPostgres(user))
    } catch (error) {
      console.error("Organizations GET direct database lookup failed:", {
        user_id: user.id,
        error,
      })
      return errorJson(
        error instanceof Error ? error.message : "Unable to load organizations"
      )
    }
  }

  const supabase = await getDataClient()
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")

  if (membershipError) {
    console.error("Organizations GET membership lookup failed:", {
      user_id: user.id,
      error: membershipError,
    })
    return errorJson(membershipError.message)
  }

  const organizationIds = (memberships || []).map((membership) =>
    String(membership.organization_id)
  )

  if (!organizationIds.length) {
    const created = await getOrCreateDefaultOrganization(supabase, user)
    if (!created.ok) {
      console.error("Organizations GET default creation failed:", {
        user_id: user.id,
        error: created.error,
        status: created.status,
      })
      return errorJson(created.error, created.status)
    }
    return json([created.organization])
  }

  const { data: organizations, error } = await supabase
    .from("organizations")
    .select(selectOrganization)
    .in("id", organizationIds)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Organizations GET organization lookup failed:", {
      user_id: user.id,
      organization_ids: organizationIds,
      error,
    })
    return errorJson(error.message)
  }

  return json(
    (organizations || []).map((organization) => {
      const membership = memberships?.find(
        (row) => row.organization_id === organization.id
      )

      return {
        ...organization,
        role: membership?.role || null,
      }
    })
  )
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return errorJson("Not authenticated", 401)
  }

  const body = await readJsonBody(request)
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 80) {
    return errorJson("name must be a string up to 80 characters.", 400)
  }

  const supabase = await getDataClient()
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug: makeSlug(name, "organization"),
      owner_user_id: user.id,
    })
    .select(selectOrganization)
    .single()

  if (organizationError || !organization) {
    return errorJson(
      organizationError?.message || "Unable to create organization"
    )
  }

  const organizationId = String(organization.id)
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: user.id,
      role: "owner",
      status: "active",
    })

  if (memberError) {
    return errorJson(memberError.message)
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      organization_id: organizationId,
      name: "Default Workspace",
      slug: "default",
      created_by_user_id: user.id,
      is_default: true,
    })
    .select(selectWorkspace)
    .single()

  if (workspaceError || !workspace) {
    return errorJson(workspaceError?.message || "Unable to create workspace")
  }

  const { error: workspaceMemberError } = await supabase
    .from("workspace_members")
    .insert({
      organization_id: organizationId,
      workspace_id: String(workspace.id),
      user_id: user.id,
      role: "owner",
    })

  if (workspaceMemberError) {
    return errorJson(workspaceMemberError.message)
  }

  return json(
    {
      ...organization,
      role: "owner",
      default_workspace: workspace,
    },
    { status: 201 }
  )
}
