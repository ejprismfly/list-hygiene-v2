import {
  errorJson,
  getCurrentUser,
  getDataClient,
  getOrCreateDefaultOrganization,
  json,
  makeSlug,
  readJsonBody,
} from "@/lib/api/tenant"

const selectOrganization = "id, name, slug, owner_user_id, created_at"
const selectWorkspace = "id, organization_id, name, slug, is_default, created_at"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return errorJson("Not authenticated", 401)
  }

  const supabase = await getDataClient()
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")

  if (membershipError) {
    return errorJson(membershipError.message)
  }

  const organizationIds = (memberships || []).map((membership) =>
    String(membership.organization_id)
  )

  if (!organizationIds.length) {
    const created = await getOrCreateDefaultOrganization(supabase, user)
    if (!created.ok) {
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
