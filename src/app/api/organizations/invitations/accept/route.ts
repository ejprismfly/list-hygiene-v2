import crypto from "crypto"

import {
  errorJson,
  getCurrentUser,
  getDataClient,
  json,
  readJsonBody,
} from "@/lib/api/tenant"
import {
  addExistingUserToTeam,
  normalizeWorkspaceIds,
} from "@/lib/api/team-members"

const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return errorJson("Not authenticated", 401)
  }

  if (!user.email) {
    return errorJson("User email is required to accept an invitation", 403)
  }

  const body = await readJsonBody(request)
  const token = typeof body.token === "string" ? body.token : ""
  if (!token) {
    return errorJson("token must be a string.", 400)
  }

  const supabase = await getDataClient()
  const { data: invitation, error } = await supabase
    .from("organization_invitations")
    .select(
      "id, organization_id, email, role, workspace_ids, status, expires_at, accepted_by_user_id"
    )
    .eq("token_hash", hashToken(token))
    .single()

  if (error || !invitation) {
    return errorJson("Invitation not found", 404)
  }

  const role = invitation.role === "admin" ? "admin" : "member"
  const requestedWorkspaceIds = normalizeWorkspaceIds(invitation.workspace_ids)

  if (invitation.status === "accepted") {
    if (invitation.accepted_by_user_id === user.id) {
      return json({
        organization_id: invitation.organization_id,
        role,
        workspace_ids: requestedWorkspaceIds,
      })
    }

    return errorJson("Invitation has already been accepted", 409)
  }

  if (invitation.status !== "pending") {
    return errorJson("Invitation is no longer pending", 409)
  }

  if (new Date(String(invitation.expires_at)).getTime() < Date.now()) {
    await supabase
      .from("organization_invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)

    return errorJson("Invitation expired", 410)
  }

  if (String(invitation.email).toLowerCase() !== user.email.toLowerCase()) {
    return errorJson(
      "Invitation email does not match the signed-in user",
      403
    )
  }

  const added = await addExistingUserToTeam({
    acceptedInvitationId: invitation.id,
    organizationId: invitation.organization_id,
    profile: {
      user_id: user.id,
      email: user.email,
      name: null,
    },
    role,
    supabase,
    workspaceIds: requestedWorkspaceIds,
  })

  if (!added.ok) {
    return errorJson(added.error)
  }

  return json({
    organization_id: invitation.organization_id,
    role: added.member.role,
    workspace_ids: added.member.workspace_ids,
  })
}
