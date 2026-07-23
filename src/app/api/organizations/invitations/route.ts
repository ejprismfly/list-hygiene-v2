import crypto from "crypto"

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
  normalizeWorkspaceIds,
  resolveTeamWorkspaceIds,
} from "@/lib/api/team-members"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildInviteAuthRedirectUrl, buildInviteUrl } from "@/lib/url-safety.cjs"

const invitationSelect =
  "id, organization_id, email, role, workspace_ids, status, expires_at, created_at, updated_at"
const inviteResendCooldownMs = 60 * 1000

const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}

type SendSupabaseInviteEmailArgs = {
  adminSupabase: ReturnType<typeof createAdminClient>
  email: string
  organizationId: string
  role: "admin" | "member"
  request: Request
  token: string
  workspaceIds: string[]
}

function isInviteSendCoolingDown(updatedAt?: string | null) {
  if (!updatedAt) {
    return false
  }

  return Date.now() - new Date(updatedAt).getTime() < inviteResendCooldownMs
}

function isAlreadyRegisteredAuthError(message?: string) {
  return /already (been )?registered|user already registered/i.test(message || "")
}

const buildInvitationResponse = (request: Request, invitation: object, token: string) => {
  return {
    ...invitation,
    token,
    invite_url: buildInviteUrl({
      requestUrl: request.url,
      originHeader: request.headers.get("origin"),
      cfVisitor: request.headers.get("cf-visitor"),
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      hostHeader: request.headers.get("host"),
      configuredHost: process.env.NEXT_PUBLIC_APP_HOST,
      token,
    }),
  }
}

const buildInviteRedirectTo = (request: Request, token: string) => {
  return buildInviteAuthRedirectUrl({
    requestUrl: request.url,
    originHeader: request.headers.get("origin"),
    cfVisitor: request.headers.get("cf-visitor"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    hostHeader: request.headers.get("host"),
    configuredHost: process.env.NEXT_PUBLIC_APP_HOST,
    token,
  })
}

const sendSupabaseInviteEmail = async ({
  adminSupabase,
  email,
  organizationId,
  role,
  request,
  token,
  workspaceIds,
}: SendSupabaseInviteEmailArgs) => {
  return adminSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: buildInviteRedirectTo(request, token),
    data: {
      invited_via: "list_hygiene_workspace",
      organization_id: organizationId,
      role,
      workspace_ids: workspaceIds,
    },
  })
}

async function deliverSupabaseInviteEmail(args: SendSupabaseInviteEmailArgs) {
  let authResponse: Awaited<ReturnType<typeof sendSupabaseInviteEmail>>
  try {
    authResponse = await sendSupabaseInviteEmail(args)
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to send invitation email.",
    }
  }

  const { data, error } = authResponse
  if (error) {
    if (isAlreadyRegisteredAuthError(error.message)) {
      return {
        ok: true as const,
        authUserId: null,
        emailDelivery: "manual_link" as const,
        emailDeliveryError: error.message,
      }
    }

    return { ok: false as const, error: error.message }
  }

  return {
    ok: true as const,
    authUserId: data.user?.id || null,
    emailDelivery: "supabase_auth" as const,
    emailDeliveryError: null,
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

  const resolvedWorkspaceIds = await resolveTeamWorkspaceIds({
    organizationId: context.organizationId,
    role,
    supabase,
    workspaceIds,
  })

  if (!resolvedWorkspaceIds.ok) {
    return errorJson(resolvedWorkspaceIds.error, 400)
  }

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
      new Set([...existingWorkspaceIds, ...resolvedWorkspaceIds.workspaceIds])
    )
    if (isInviteSendCoolingDown(existingInvitation.updated_at)) {
      return errorJson("Please wait before resending this invitation.", 429)
    }

    let adminSupabase: ReturnType<typeof createAdminClient>
    try {
      adminSupabase = createAdminClient()
    } catch {
      return errorJson(
        "SUPABASE_SERVICE_ROLE_KEY is required to send invitation emails.",
        500
      )
    }

    const token = crypto.randomBytes(32).toString("hex")
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

    const delivery = await deliverSupabaseInviteEmail({
      adminSupabase,
      email,
      organizationId: context.organizationId,
      role,
      request,
      token,
      workspaceIds: mergedWorkspaceIds,
    })

    if (!delivery.ok) {
      return errorJson(delivery.error)
    }

    return json({
      ...buildInvitationResponse(request, data, token),
      auth_user_id: delivery.authUserId,
      email_delivery: delivery.emailDelivery,
      email_delivery_error: delivery.emailDeliveryError,
      resent: delivery.emailDelivery === "supabase_auth",
    })
  }

  const profileLookup = await findTeamMemberProfileByEmail(supabase, email)
  if (!profileLookup.ok) {
    return errorJson(profileLookup.error)
  }

  if (profileLookup.profile) {
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

    return json(
      {
        member: added.member,
        email_delivery: "existing_user",
        accepted: true,
      },
      { status: 201 }
    )
  }

  let adminSupabase: ReturnType<typeof createAdminClient>
  try {
    adminSupabase = createAdminClient()
  } catch {
    return errorJson(
      "SUPABASE_SERVICE_ROLE_KEY is required to send invitation emails.",
      500
    )
  }

  const token = crypto.randomBytes(32).toString("hex")

  const { data, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: context.organizationId,
      email,
      role,
      workspace_ids: resolvedWorkspaceIds.workspaceIds,
      token_hash: hashToken(token),
      invited_by_user_id: context.user?.id,
    })
    .select(invitationSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Unable to create invitation")
  }

  const delivery = await deliverSupabaseInviteEmail({
    adminSupabase,
    email,
    organizationId: context.organizationId,
    role,
    request,
    token,
    workspaceIds: resolvedWorkspaceIds.workspaceIds,
  })

  if (!delivery.ok) {
    await supabase
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id)

    return errorJson(delivery.error)
  }

  return json(
    {
      ...buildInvitationResponse(request, data, token),
      auth_user_id: delivery.authUserId,
      email_delivery: delivery.emailDelivery,
      email_delivery_error: delivery.emailDeliveryError,
    },
    { status: 201 }
  )
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
  const action = typeof body.action === "string" ? body.action : ""
  const status = body.status || "revoked"

  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  if (action === "resend") {
    const { data: invitation, error: invitationError } = await supabase
      .from("organization_invitations")
      .select(invitationSelect)
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .eq("status", "pending")
      .single()

    if (invitationError || !invitation) {
      return errorJson(
        invitationError?.message || "Pending invitation not found",
        404
      )
    }

    const role = invitation.role === "admin" ? "admin" : "member"
    const workspaceIds = normalizeWorkspaceIds(invitation.workspace_ids)
    const resolvedWorkspaceIds = await resolveTeamWorkspaceIds({
      organizationId: context.organizationId,
      role,
      supabase,
      workspaceIds,
    })

    if (!resolvedWorkspaceIds.ok) {
      return errorJson(resolvedWorkspaceIds.error, 400)
    }

    if (isInviteSendCoolingDown(invitation.updated_at)) {
      return errorJson("Please wait before resending this invitation.", 429)
    }

    let adminSupabase: ReturnType<typeof createAdminClient>
    try {
      adminSupabase = createAdminClient()
    } catch {
      return errorJson(
        "SUPABASE_SERVICE_ROLE_KEY is required to send invitation emails.",
        500
      )
    }

    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString()
    const { data, error } = await supabase
      .from("organization_invitations")
      .update({
        token_hash: hashToken(token),
        workspace_ids: resolvedWorkspaceIds.workspaceIds,
        invited_by_user_id: context.user?.id,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .eq("status", "pending")
      .select(invitationSelect)
      .single()

    if (error || !data) {
      return errorJson(error?.message || "Unable to refresh invitation")
    }

    const delivery = await deliverSupabaseInviteEmail({
      adminSupabase,
      email: data.email,
      organizationId: context.organizationId,
      role,
      request,
      token,
      workspaceIds: resolvedWorkspaceIds.workspaceIds,
    })

    if (!delivery.ok) {
      return errorJson(delivery.error)
    }

    return json({
      ...buildInvitationResponse(request, data, token),
      auth_user_id: delivery.authUserId,
      email_delivery: delivery.emailDelivery,
      email_delivery_error: delivery.emailDeliveryError,
      resent: delivery.emailDelivery === "supabase_auth",
    })
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
