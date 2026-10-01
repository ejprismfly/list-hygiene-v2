import { getVerifiedSession } from "@/lib/auth-session"
import { isUuid } from "@/lib/api/validation"

import {
  canManageWorkspace,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"
import {
  validManagedMemberRole,
} from "@/lib/api/team-members"

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
  const { POST: invite } = await import("../invitations/route")
  return invite(request)
}

async function mutateMember(request: Request, remove: boolean) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) return errorJson(tenant.error, tenant.status)
  if (!canManageWorkspace(tenant.context.role)) return errorJson("Admin access required", 403)
  const verified = await getVerifiedSession()
  if (!verified) return errorJson("Verified session required", 401)
  const body = await readJsonBody(request)
  if (!isUuid(body.user_id)) return errorJson("Valid user_id required", 400)
  if (!remove && body.role !== undefined && !validManagedMemberRole(body.role)) return errorJson("role must be admin or member", 400)
  if (!remove && body.status !== undefined && body.status !== "active" && body.status !== "disabled") return errorJson("status must be active or disabled", 400)
  const { data, error } = await tenant.supabase.rpc("manage_workspace_member", {
    p_workspace_id: tenant.context.workspaceId, p_actor_id: verified.user.id, p_session_id: verified.sessionId,
    p_target_id: body.user_id, p_role: remove ? null : body.role ?? null, p_status: remove ? null : body.status ?? null, p_remove: remove,
  })
  if (error) return errorJson("This membership change is unavailable or you lack permission across the affected workspaces", error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503)
  return json(data)
}
export async function PATCH(request: Request) { return mutateMember(request, false) }
export async function DELETE(request: Request) { return mutateMember(request, true) }
