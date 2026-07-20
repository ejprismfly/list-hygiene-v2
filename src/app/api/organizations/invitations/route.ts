import crypto from "crypto"

import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"
import { buildInviteUrl } from "@/lib/url-safety.cjs"

const invitationSelect =
  "id, organization_id, email, role, workspace_ids, status, expires_at, created_at"

const normalizeWorkspaceIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((id): id is string => typeof id === "string" && !!id)
}

const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}

const buildInvitationResponse = (request: Request, invitation: object, token: string) => {
  return {
    ...invitation,
    token,
    invite_url: buildInviteUrl({
      requestUrl: request.url,
      originHeader: request.headers.get("origin"),
      configuredHost: process.env.NEXT_PUBLIC_APP_HOST,
      token,
    }),
  }
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
    return errorJson("Only owners and admins can manage invitations", 403)
  }

  const { data, error } = await supabase
    .from("organization_invitations")
    .select(invitationSelect)
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })

  if (error) {
    return errorJson(error.message)
  }

  return json(data || [])
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
    return errorJson("Only owners and admins can manage invitations", 403)
  }

  const body = await readJsonBody(request)
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const role = body.role || "member"
  const workspaceIds = normalizeWorkspaceIds(body.workspace_ids)

  if (!email) {
    return errorJson("email must be a string.", 400)
  }

  if (role !== "admin" && role !== "member") {
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

  const token = crypto.randomBytes(32).toString("hex")
  const { data: existingInvitation, error: existingInvitationError } =
    await supabase
      .from("organization_invitations")
      .select(invitationSelect)
      .eq("organization_id", context.organizationId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle()

  if (existingInvitationError) {
    return errorJson(existingInvitationError.message)
  }

  if (existingInvitation) {
    const existingWorkspaceIds = Array.isArray(existingInvitation.workspace_ids)
      ? existingInvitation.workspace_ids.filter(
          (id): id is string => typeof id === "string" && !!id
        )
      : []
    const mergedWorkspaceIds = Array.from(
      new Set([...existingWorkspaceIds, ...workspaceIds])
    )

    const { data, error } = await supabase
      .from("organization_invitations")
      .update({
        role,
        workspace_ids: mergedWorkspaceIds,
        token_hash: hashToken(token),
        invited_by_user_id: context.user?.id,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", existingInvitation.id)
      .select(invitationSelect)
      .single()

    if (error || !data) {
      return errorJson(error?.message || "Unable to refresh invitation")
    }

    return json(buildInvitationResponse(request, data, token))
  }

  const { data, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: context.organizationId,
      email,
      role,
      workspace_ids: workspaceIds,
      token_hash: hashToken(token),
      invited_by_user_id: context.user?.id,
    })
    .select(invitationSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Unable to create invitation")
  }

  return json(buildInvitationResponse(request, data, token), { status: 201 })
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
    return errorJson("Only owners and admins can manage invitations", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  const status = body.status || "revoked"

  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  if (status !== "revoked") {
    return errorJson("status must be revoked.", 400)
  }

  const { data, error } = await supabase
    .from("organization_invitations")
    .update({ status: "revoked" })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .eq("status", "pending")
    .select(invitationSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Pending invitation not found", 404)
  }

  return json(data)
}
