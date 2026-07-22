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
  type ManagedMemberRole,
  normalizeWorkspaceIds,
  resolveTeamWorkspaceIds,
  validManagedMemberRole,
} from "@/lib/api/team-members"

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

  const resolvedWorkspaceIds = await resolveTeamWorkspaceIds({
    organizationId: context.organizationId,
    role,
    supabase,
    workspaceIds,
  })

  if (!resolvedWorkspaceIds.ok) {
    return errorJson(resolvedWorkspaceIds.error, 400)
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
    workspaceIds: resolvedWorkspaceIds.workspaceIds,
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

  const hasRoleUpdate = body.role !== undefined
  const hasStatusUpdate = body.status !== undefined
  const hasWorkspaceUpdate = body.workspace_ids !== undefined
  if (!hasRoleUpdate && !hasStatusUpdate && !hasWorkspaceUpdate) {
    return errorJson("No updates provided.", 400)
  }

  const { data: member, error: memberLookupError } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId)
    .single()

  if (memberLookupError || !member) {
    return errorJson(memberLookupError?.message || "Member not found", 404)
  }

  if (member.role === "owner") {
    return errorJson("Owners cannot be changed.", 403)
  }

  const updates: Record<string, unknown> = {}
  let nextRole: ManagedMemberRole = member.role === "admin" ? "admin" : "member"
  if (hasRoleUpdate) {
    if (!validManagedMemberRole(body.role)) {
      return errorJson("role must be admin or member.", 400)
    }
    updates.role = body.role
    nextRole = body.role
  }

  if (hasStatusUpdate) {
    if (body.status !== "active" && body.status !== "disabled") {
      return errorJson("status must be active or disabled.", 400)
    }
    updates.status = body.status
  }

  let resolvedWorkspaceIds: string[] | null = null
  if (hasWorkspaceUpdate || (hasRoleUpdate && nextRole === "admin")) {
    const workspaceIds = hasWorkspaceUpdate
      ? normalizeWorkspaceIds(body.workspace_ids)
      : []
    const resolved = await resolveTeamWorkspaceIds({
      organizationId: context.organizationId,
      role: nextRole,
      supabase,
      workspaceIds,
    })

    if (!resolved.ok) {
      return errorJson(resolved.error, 400)
    }

    resolvedWorkspaceIds = resolved.workspaceIds
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

  if (resolvedWorkspaceIds) {
    const { error: workspaceDeleteError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("user_id", userId)

    if (workspaceDeleteError) {
      return errorJson(workspaceDeleteError.message)
    }

    if (resolvedWorkspaceIds.length) {
      const { error: workspaceUpsertError } = await supabase
        .from("workspace_members")
        .upsert(
          resolvedWorkspaceIds.map((workspaceId) => ({
            organization_id: context.organizationId,
            workspace_id: workspaceId,
            user_id: userId,
            role: nextRole,
          })),
          { onConflict: "workspace_id,user_id" }
        )

      if (workspaceUpsertError) {
        return errorJson(workspaceUpsertError.message)
      }
    }
  } else if (hasRoleUpdate) {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: nextRole })
      .eq("organization_id", context.organizationId)
      .eq("user_id", userId)

    if (error) {
      return errorJson(error.message)
    }
  }

  return json({
    user_id: userId,
    role: nextRole,
    workspace_ids: resolvedWorkspaceIds,
  })
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
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : context.workspaceId
  const scope = typeof body.scope === "string" ? body.scope : "workspace"
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

  if (scope !== "organization" && workspaceId) {
    if (member.role === "admin") {
      return errorJson(
        "Admins have organization-wide access. Change the role to member before removing workspace access.",
        400
      )
    }

    const { count, error: workspaceLookupError } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("id", workspaceId)
      .is("archived_at", null)

    if (workspaceLookupError) {
      return errorJson(workspaceLookupError.message)
    }

    if (!count) {
      return errorJson("Workspace not found", 404)
    }

    const { error: workspaceRemoveError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)

    if (workspaceRemoveError) {
      return errorJson(workspaceRemoveError.message)
    }

    const { count: remainingWorkspaceCount, error: remainingWorkspaceError } =
      await supabase
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("user_id", userId)

    if (remainingWorkspaceError) {
      return errorJson(remainingWorkspaceError.message)
    }

    if (!remainingWorkspaceCount) {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", context.organizationId)
        .eq("user_id", userId)
        .neq("role", "owner")

      if (error) {
        return errorJson(error.message)
      }
    }

    return json({
      user_id: userId,
      workspace_id: workspaceId,
      organization_removed: !remainingWorkspaceCount,
    })
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
