import crypto from "crypto"

import {
  errorJson,
  getCurrentUser,
  getDataClient,
  json,
  readJsonBody,
} from "@/lib/api/tenant"

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
    .select("id, organization_id, email, role, workspace_ids, status, expires_at")
    .eq("token_hash", hashToken(token))
    .eq("status", "pending")
    .single()

  if (error || !invitation) {
    return errorJson("Invitation not found", 404)
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

  const role = invitation.role === "admin" ? "admin" : "member"
  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: invitation.organization_id,
        user_id: user.id,
        role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" }
    )

  if (memberError) {
    return errorJson(memberError.message)
  }

  const workspaceIds = Array.isArray(invitation.workspace_ids)
    ? invitation.workspace_ids.filter(
        (id): id is string => typeof id === "string"
      )
    : []

  if (workspaceIds.length) {
    const { error: workspaceError } = await supabase
      .from("workspace_members")
      .upsert(
        workspaceIds.map((workspaceId) => ({
          organization_id: invitation.organization_id,
          workspace_id: workspaceId,
          user_id: user.id,
          role,
        })),
        { onConflict: "workspace_id,user_id" }
      )

    if (workspaceError) {
      return errorJson(workspaceError.message)
    }
  }

  await supabase
    .from("organization_invitations")
    .update({
      status: "accepted",
      accepted_by_user_id: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)

  return json({
    organization_id: invitation.organization_id,
    role,
    workspace_ids: workspaceIds,
  })
}
