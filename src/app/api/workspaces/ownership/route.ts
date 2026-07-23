import {
  canOwnWorkspace,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId || !context.workspaceId) {
    return errorJson("Workspace access required", 403)
  }

  if (!canOwnWorkspace(context.role)) {
    return errorJson("Only the workspace owner can transfer ownership", 403)
  }

  const body = await readJsonBody(request)
  const newOwnerUserId =
    typeof body.new_owner_user_id === "string" ? body.new_owner_user_id : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!newOwnerUserId) {
    return errorJson("new_owner_user_id must be a string.", 400)
  }

  if (!password) {
    return errorJson("Password confirmation is required.", 400)
  }

  if (!context.user?.id || !context.user.email) {
    return errorJson("Not authenticated", 401)
  }

  if (newOwnerUserId === context.user.id) {
    return errorJson("Choose a different workspace admin as the new owner.", 400)
  }

  const { data: newOwner, error: newOwnerError } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", newOwnerUserId)
    .eq("role", "admin")
    .single()

  if (newOwnerError || !newOwner) {
    return errorJson(
      "Ownership can only be transferred to an active workspace admin.",
      400
    )
  }

  const authClient = await createClient()
  const { data: passwordCheck, error: passwordError } =
    await authClient.auth.signInWithPassword({
      email: context.user.email,
      password,
    })

  if (
    passwordError ||
    !passwordCheck.user ||
    passwordCheck.user.id !== context.user.id
  ) {
    return errorJson("Password confirmation failed.", 403)
  }

  const { error: transferError } = await supabase.rpc(
    "transfer_workspace_ownership",
    {
      p_workspace_id: context.workspaceId,
      p_current_owner_user_id: context.user.id,
      p_new_owner_user_id: newOwnerUserId,
    }
  )

  if (transferError) {
    return errorJson(
      transferError.code === "42883"
        ? "Run the workspace roles migration before transferring ownership."
        : transferError.message,
      500
    )
  }

  return json({
    workspace_id: context.workspaceId,
    owner_user_id: newOwnerUserId,
    previous_owner_user_id: context.user.id,
  })
}
