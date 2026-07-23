import type { SupabaseClient } from "@supabase/supabase-js"

import {
  canManageWorkspace,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type OrganizationRole,
} from "@/lib/api/tenant"
import {
  addExistingUserToTeam,
  findTeamMemberProfileByEmail,
  type ManagedMemberRole,
  normalizeWorkspaceIds,
  resolveTeamWorkspaceIds,
  validManagedMemberRole,
} from "@/lib/api/team-members"

function roleRank(role: OrganizationRole) {
  return role === "owner" ? 1 : role === "admin" ? 2 : 3
}

function highestRole(roles: OrganizationRole[]) {
  return roles.sort((a, b) => roleRank(a) - roleRank(b))[0] || null
}

async function syncOrganizationMemberRole({
  organizationId,
  supabase,
  userId,
}: {
  organizationId: string
  supabase: SupabaseClient
  userId: string
}) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces!inner(archived_at)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("workspaces.archived_at", null)

  if (error) {
    return { ok: false as const, error: error.message }
  }

  const nextRole = highestRole(
    (data || []).map((row) => row.role as OrganizationRole)
  )

  if (!nextRole) {
    const { error: deleteError } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId)

    return deleteError
      ? { ok: false as const, error: deleteError.message }
      : { ok: true as const, role: null }
  }

  const { error: updateError } = await supabase
    .from("organization_members")
    .update({ role: nextRole, status: "active" })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)

  return updateError
    ? { ok: false as const, error: updateError.message }
    : { ok: true as const, role: nextRole }
}

async function countWorkspaceManagers({
  excludeUserId,
  organizationId,
  supabase,
  workspaceId,
}: {
  excludeUserId?: string
  organizationId: string
  supabase: SupabaseClient
  workspaceId: string
}) {
  let query = supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])

  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId)
  }

  const { count, error } = await query
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const, count: count || 0 }
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!context.workspaceId) {
    return errorJson("Workspace access required", 403)
  }

  const { data: workspaceMembers, error } = await supabase
    .from("workspace_members")
    .select("id, organization_id, workspace_id, user_id, role, created_at")
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", context.workspaceId)
    .order("created_at", { ascending: true })

  if (error) {
    return errorJson(error.message)
  }

  const userIds = (workspaceMembers || []).map((member) => String(member.user_id))
  const { data: profiles } = userIds.length
    ? await supabase
        .from("user_details")
        .select("user_id, email, name")
        .in("user_id", userIds)
    : { data: [] }

  const { data: organizationMembers, error: organizationMembersError } =
    userIds.length
      ? await supabase
          .from("organization_members")
          .select("user_id, status")
          .eq("organization_id", context.organizationId)
          .in("user_id", userIds)
      : { data: [], error: null }

  if (organizationMembersError) {
    return errorJson(organizationMembersError.message)
  }

  return json(
    (workspaceMembers || []).map((member) => {
      const profile = profiles?.find((row) => row.user_id === member.user_id)
      const organizationMember = organizationMembers?.find(
        (row) => row.user_id === member.user_id
      )

      return {
        ...member,
        status: organizationMember?.status || "active",
        email: profile?.email || null,
        name: profile?.name || null,
        workspace_ids: [String(member.workspace_id)],
      }
    })
  )
}

export async function POST(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageWorkspace(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const role = body.role || "member"
  const workspaceIds = normalizeWorkspaceIds(body.workspace_ids).length
    ? normalizeWorkspaceIds(body.workspace_ids)
    : context.workspaceId
      ? [context.workspaceId]
      : []

  if (!email) {
    return errorJson("email must be a string.", 400)
  }

  if (!validManagedMemberRole(role)) {
    return errorJson("role must be admin or member.", 400)
  }

  const resolvedWorkspaceIds = await resolveTeamWorkspaceIds({
    organizationId: context.organizationId,
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
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!context.workspaceId) {
    return errorJson("Workspace access required", 403)
  }

  if (!canManageWorkspace(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!userId) {
    return errorJson("user_id must be a string.", 400)
  }

  const hasRoleUpdate = body.role !== undefined
  const hasStatusUpdate = body.status !== undefined
  if (!hasRoleUpdate && !hasStatusUpdate) {
    return errorJson("No updates provided.", 400)
  }

  const { data: member, error: memberLookupError } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId)
    .single()

  if (memberLookupError || !member) {
    return errorJson(memberLookupError?.message || "Member not found", 404)
  }

  if (member.role === "owner") {
    return errorJson("Transfer ownership before changing the workspace owner.", 403)
  }

  let nextRole: ManagedMemberRole = member.role === "admin" ? "admin" : "member"
  if (hasRoleUpdate) {
    if (!validManagedMemberRole(body.role)) {
      return errorJson("role must be admin or member.", 400)
    }
    nextRole = body.role
  }

  if (hasStatusUpdate) {
    if (body.status !== "active" && body.status !== "disabled") {
      return errorJson("status must be active or disabled.", 400)
    }
    const { error: statusError } = await supabase
      .from("organization_members")
      .update({ status: body.status })
      .eq("organization_id", context.organizationId)
      .eq("user_id", userId)

    if (statusError) {
      return errorJson(statusError.message)
    }
  }

  if (hasRoleUpdate && member.role === "admin" && nextRole === "member") {
    const managers = await countWorkspaceManagers({
      excludeUserId: userId,
      organizationId: context.organizationId,
      supabase,
      workspaceId: context.workspaceId,
    })
    if (!managers.ok) {
      return errorJson(managers.error)
    }
    if (!managers.count) {
      return errorJson("At least one workspace admin or owner is required.", 400)
    }
  }

  if (hasRoleUpdate) {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: nextRole })
      .eq("organization_id", context.organizationId)
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", userId)

    if (error) {
      return errorJson(error.message)
    }
  }

  const synced = await syncOrganizationMemberRole({
    organizationId: context.organizationId,
    supabase,
    userId,
  })
  if (!synced.ok) {
    return errorJson(synced.error)
  }

  return json({
    user_id: userId,
    role: nextRole,
    workspace_ids: [context.workspaceId],
  })
}

export async function DELETE(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!context.workspaceId) {
    return errorJson("Workspace access required", 403)
  }

  if (!canManageWorkspace(context.role)) {
    return errorJson("Only owners and admins can manage members", 403)
  }

  const body = await readJsonBody(request)
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  const workspaceId = context.workspaceId
  if (!userId) {
    return errorJson("user_id must be a string.", 400)
  }

  const { data: member, error: lookupError } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single()

  if (lookupError || !member) {
    return errorJson(lookupError?.message || "Member not found", 404)
  }

  if (member.role === "owner") {
    return errorJson("Transfer ownership before removing the workspace owner.", 403)
  }

  if (member.role === "admin") {
    const managers = await countWorkspaceManagers({
      excludeUserId: userId,
      organizationId: context.organizationId,
      supabase,
      workspaceId: workspaceId || "",
    })
    if (!managers.ok) {
      return errorJson(managers.error)
    }
    if (!managers.count) {
      return errorJson("At least one workspace admin or owner is required.", 400)
    }
  }

  const { error: workspaceError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)

  if (workspaceError) {
    return errorJson(workspaceError.message)
  }

  const synced = await syncOrganizationMemberRole({
    organizationId: context.organizationId,
    supabase,
    userId,
  })
  if (!synced.ok) {
    return errorJson(synced.error)
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

  return json({
    user_id: userId,
    workspace_id: workspaceId,
    organization_removed: !remainingWorkspaceCount,
  })
}
