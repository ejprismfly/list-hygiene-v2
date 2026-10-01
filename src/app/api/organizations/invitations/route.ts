import { randomBytes } from "node:crypto"
import type { PoolClient } from "pg"
import { canManageWorkspace, errorJson, json, readJsonBody, resolveTenantContext } from "@/lib/api/tenant"
import { normalizeWorkspaceIds } from "@/lib/api/team-members"
import { isUuid, normalizedEmail } from "@/lib/api/validation"
import { getVerifiedSession } from "@/lib/auth-session"
import { hashAuthToken, limitAuthAttempt } from "@/lib/auth-security"
import { withTransaction } from "@/lib/db/postgres"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildInviteAuthRedirectUrl, buildInviteUrl } from "@/lib/url-safety.cjs"

class InvitationError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}
async function authorizeWorkspaces(client: PoolClient, organization: string, actor: string, workspaceIds: string[]) {
  if (!workspaceIds.length || workspaceIds.some((id) => !isUuid(id))) throw new InvitationError("Invalid workspaces", 400)
  const { rows } = await client.query(`select w.id from public.workspaces w
    join public.workspace_members wm on wm.workspace_id=w.id and wm.organization_id=w.organization_id
    join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id
    where w.organization_id=$1 and w.id=any($2::uuid[]) and w.archived_at is null
      and wm.user_id=$3 and wm.role in ('owner','admin') and om.status='active'
    order by w.id for share of w,wm,om`, [organization, workspaceIds, actor])
  if (rows.length !== new Set(workspaceIds).size) throw new InvitationError("Admin access is required for every invited workspace", 403)
}
export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) return errorJson(tenant.error, tenant.status)
  const { context, supabase } = tenant
  if (!canManageWorkspace(context.role)) return errorJson("Admin access required", 403)
  const { data, error } = await supabase.from("organization_invitations")
    .select("id,organization_id,email,role,workspace_ids,status,expires_at,created_at,updated_at")
    .eq("organization_id", context.organizationId).contains("workspace_ids", [context.workspaceId]).order("created_at", { ascending: false })
  if (error) return errorJson("Invitations are temporarily unavailable", 503)
  const { data: managedMemberships, error: managerError } = await supabase.from("workspace_members")
    .select("workspace_id").eq("user_id", context.user!.id).eq("organization_id", context.organizationId).in("role", ["owner", "admin"])
  if (managerError) return errorJson("Invitations are temporarily unavailable", 503)
  const managedIds = new Set((managedMemberships || []).map((membership) => membership.workspace_id))
  return json((data || []).filter((invite) => invite.workspace_ids.every((id: string) => managedIds.has(id))).map((invite) => ({ ...invite, status: invite.status === "pending" && new Date(invite.expires_at).getTime() <= Date.now() ? "expired" : invite.status })))
}
async function mutate(request: Request, patch: boolean) {
  try {
    const tenant = await resolveTenantContext(request, { requireWorkspace: true })
    if (!tenant.ok) return errorJson(tenant.error, tenant.status)
    const { context } = tenant
    if (!context.organizationId || !context.workspaceId || !canManageWorkspace(context.role)) return errorJson("Admin access required", 403)
    const verified = await getVerifiedSession()
    if (!verified) return errorJson("Verified session required", 401)
    const body = await readJsonBody(request)
    const email = normalizedEmail(body.email)
    const role = body.role || "member"
    const workspaceIds = normalizeWorkspaceIds(body.workspace_ids)
    const id = typeof body.id === "string" && isUuid(body.id) ? body.id : null
    const revoke = patch && body.action !== "resend" && body.status === "revoked"
    if (patch && (!id || (!revoke && body.action !== "resend"))) return errorJson("Invalid invitation action", 400)
    if (!patch && (!email || (role !== "admin" && role !== "member"))) return errorJson("Valid email and role required", 400)
    const result = await withTransaction(async (client) => {
      const active = await client.query(`select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=$1 and s.user_id=$2 and (s.not_after is null or s.not_after>now()) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) for share of s`, [verified.sessionId, verified.user.id])
      if (!active.rowCount) throw new InvitationError("Verified session required", 401)
      // Serialize creation for the same organization and recipient too.
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${context.organizationId}:${id || email}`])
      const existing = await client.query(patch
        ? "select * from public.organization_invitations where organization_id=$1 and id=$2 for update"
        : "select * from public.organization_invitations where organization_id=$1 and email=$2 and status in ('pending','expired') order by (status='pending') desc,updated_at desc limit 1 for update", [context.organizationId, patch ? id : email])
      const previous = existing.rows[0]
      if (patch && (!previous || !previous.workspace_ids.includes(context.workspaceId))) throw new InvitationError("Invitation not found", 404)
      if (previous && !["pending","expired"].includes(previous.status)) throw new InvitationError("Invitation is no longer pending")
      const targets: string[] = patch ? previous.workspace_ids : Array.from(new Set([...(previous?.workspace_ids || []), ...(workspaceIds.length ? workspaceIds : [context.workspaceId!])]))
      await authorizeWorkspaces(client, context.organizationId!, verified.user.id, targets)
      if (revoke) {
        const { rows } = await client.query("update public.organization_invitations set status='revoked',updated_at=now() where id=$1 returning *", [id])
        const { token_hash: _hash, ...safe } = rows[0]
        void _hash
        return safe
      }
      const recipient = patch ? previous.email : email!
      const limited = await limitAuthAttempt("email", recipient)
      if (limited) throw new InvitationError(limited.message, limited.errorCode === "rate_limited" ? 429 : 503)
      if (previous && Date.now() - new Date(previous.updated_at).getTime() < 60000) throw new InvitationError("Please wait before resending", 429)
      const token = randomBytes(32).toString("hex")
      const inviteRole = patch ? previous.role : role
      const values = [context.organizationId, recipient, inviteRole, targets, hashAuthToken(token), verified.user.id]
      const { rows } = previous
        ? await client.query("update public.organization_invitations set role=$3,workspace_ids=$4,token_hash=$5,invited_by_user_id=$6,status='pending',expires_at=now()+interval '14 days',updated_at=now() where organization_id=$1 and email=$2 and id=$7 returning *", [...values, previous.id])
        : await client.query("insert into public.organization_invitations(organization_id,email,role,workspace_ids,token_hash,invited_by_user_id) values($1,$2,$3,$4,$5,$6) returning *", values)
      const found = await client.query("select id from auth.users where lower(email)=lower($1) limit 1", [recipient])
      let emailDelivery = "manual_link"
      if (!found.rowCount) {
        const redirectTo = buildInviteAuthRedirectUrl({ configuredHost: process.env.NEXT_PUBLIC_APP_HOST, requestUrl: request.url, token })
        const { error } = await createAdminClient().auth.admin.inviteUserByEmail(recipient, { redirectTo })
        if (error) throw new InvitationError("Unable to send invitation email. Please try again later.", 503)
        emailDelivery = "supabase_auth"
      }
      const { token_hash: _hash, ...safe } = rows[0]
      void _hash
      return { ...safe, token, invite_url: buildInviteUrl({ configuredHost: process.env.NEXT_PUBLIC_APP_HOST, requestUrl: request.url, token }), email_delivery: emailDelivery, resent: Boolean(previous) && emailDelivery === "supabase_auth" }
    })
    return json(result, { status: revoke ? 200 : 202 })
  } catch (error) {
    return error instanceof InvitationError ? errorJson(error.message, error.status) : errorJson("Invitations are temporarily unavailable", 503)
  }
}
export async function POST(request: Request) { return mutate(request, false) }
export async function PATCH(request: Request) { return mutate(request, true) }
