import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"
import {
  addExistingUserToTeam,
  findTeamMemberProfileByEmail,
  validManagedMemberRole,
} from "@/lib/api/team-members"

const normalizeWorkspaceIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((id): id is string => typeof id === "string" && !!id)
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const { data: members, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, status, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: true })

  if (error) {
    return errorJson(error.message)
  }

  const userIds = (members || []).map((member) => String(member.user_id))
  const { data: profiles } = userIds.length
    ? await supabase
        .from("user_details")
        .select("user_id, email, name")
        .in("user_id", userIds)
    : { data: [] }

  const { data: workspaceMemberships, error: workspaceMembershipError } =
    userIds.length
      ? await supabase
          .from("workspace_members")
          .select("user_id, workspace_id")
          .eq("organization_id", context.organizationId)
          .in("user_id", userIds)
      : { data: [], error: null }

  if (workspaceMembershipError) {
    return errorJson(workspaceMembershipError.message)
  }

  return json(
    (members || []).map((member) => {
      const profile = profiles?.find((row) => row.user_id === member.user_id)
      const workspaceIds = (workspaceMemberships || [])
        .filter((row) => row.user_id === member.user_id)
        .map((row) => String(row.workspace_id))

      return {
        ...member,
        email: profile?.email || null,
        name: profile?.name || null,
        workspace_ids: workspaceIds,
      }
    })
  )
}

export async function POST(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const role = body.role || "member"
  const workspaceIds = normalizeWorkspaceIds(body.workspace_ids)

  if (!email) {
    return errorJson("email must be a string.", 400)
  }

  if (!validManagedMemberRole(role)) {
    return errorJson("role must be admin or member.", 400)
  }

  if (workspaceIds.length) {
    const { count, error } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .in("id", workspaceIds)

    if (error) {
      return errorJson(error.message)
    }

    if (count !== workspaceIds.length) {
      return errorJson("One or more workspaces are invalid.", 400)
    }
  }

  const profileLookup = await findTeamMemberProfileByEmail(supabase, email)
  if (!profileLookup.ok) {
    return errorJson(profileLookup.error)
  }

  if (!profileLookup.profile) {
    return errorJson("User does not exist. Create an invitation instead.", 404)
  }

  const added = await addExistingUserToTeam({
    email,
    invitedByUserId: context.user?.id,
    organizationId: context.organizationId,
    profile: profileLookup.profile,
    role,
    supabase,
    workspaceIds,
  })

  if (!added.ok) {
    return errorJson(added.error)
  }

  return json(added.member, { status: 201 })
}

export async function PATCH(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!userId) {
    return errorJson("user_id must be a string.", 400)
  }

  const updates: Record<string, unknown> = {}
  if (body.role !== undefined) {
    if (!validManagedMemberRole(body.role)) {
      return errorJson("role must be admin or member.", 400)
    }
    updates.role = body.role
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return errorJson("status must be active or disabled.", 400)
    }
    updates.status = body.status
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase
      .from("organization_members")
      .update(updates)
      .eq("organization_id", context.organizationId)
      .eq("user_id", userId)
      .neq("role", "owner")

    if (error) {
      return errorJson(error.message)
    }
  }

  if (body.workspace_ids !== undefined) {
    const workspaceIds = normalizeWorkspaceIds(body.workspace_ids)
    await supabase
      .from("workspace_members")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("user_id", userId)

    if (workspaceIds.length) {
      await supabase.from("workspace_members").upsert(
        workspaceIds.map((workspaceId) => ({
          organization_id: context.organizationId,
          workspace_id: workspaceId,
          user_id: userId,
          role: validManagedMemberRole(body.role) ? body.role : "member",
        })),
        { onConflict: "workspace_id,user_id" }
      )
    }
  }

  return json({ user_id: userId })
}

export async function DELETE(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!userId) {
    return errorJson("user_id must be a string.", 400)
  }

  if (userId === context.user?.id) {
    return errorJson("You cannot remove yourself from the organization.", 400)
  }

  const { data: member, error: lookupError } = await supabase
    .from("organization_members")
    .select("id, role")
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId)
    .single()

  if (lookupError || !member) {
    return errorJson(lookupError?.message || "Member not found", 404)
  }

  if (member.role === "owner") {
    return errorJson("Owners cannot be removed.", 403)
  }

  const { error: workspaceError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId)

  if (workspaceError) {
    return errorJson(workspaceError.message)
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId)
    .neq("role", "owner")

  if (error) {
    return errorJson(error.message)
  }

  return json({ user_id: userId })
}
