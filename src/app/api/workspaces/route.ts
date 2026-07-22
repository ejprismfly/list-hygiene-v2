import {
  canManageOrganization,
  errorJson,
  getCurrentUser,
  getRequestStringParam,
  json,
  makeSlug,
  readJsonBody,
  resolveTenantContext,
  type OrganizationRole,
} from "@/lib/api/tenant"
import {
  isDirectDatabaseConfigured,
  queryOne,
  queryRows,
} from "@/lib/db/postgres"

const workspaceSelect =
  "id, organization_id, name, slug, is_default, archived_at, created_at"

type WorkspaceRow = {
  id: string
  organization_id: string
  name: string
  slug: string | null
  is_default: boolean
  archived_at: string | null
  created_at: string
  has_connected_account: boolean
  has_active_billing: boolean
  member_count: number
}

type DirectWorkspaceContext = {
  userId: string
  userEmail: string | null
  organizationId: string
  role: OrganizationRole
  allowedWorkspaceIds: string[]
}

async function resolveDirectWorkspaceContext(
  request: Request
): Promise<
  | { ok: true; context: DirectWorkspaceContext }
  | { ok: false; status: number; error: string }
> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" }
  }

  const requestedOrganizationId = getRequestStringParam(
    request,
    "organization_id"
  )

  let memberships = await queryRows<{
    organization_id: string
    role: OrganizationRole
    created_at: string
  }>(
    `
      select organization_id::text, role, created_at::text
      from public.organization_members
      where user_id = $1::uuid
        and status = 'active'
        and ($2::uuid is null or organization_id = $2::uuid)
      order by created_at asc
    `,
    [user.id, requestedOrganizationId]
  )

  if (!memberships.length) {
    if (requestedOrganizationId) {
      return { ok: false, status: 403, error: "Organization access denied" }
    }

    await queryRows(
      "select public.ensure_default_organization_workspace($1::uuid, $2::text, '{}'::jsonb)",
      [user.id, user.email || ""]
    )

    memberships = await queryRows<{
      organization_id: string
      role: OrganizationRole
      created_at: string
    }>(
      `
        select organization_id::text, role, created_at::text
        from public.organization_members
        where user_id = $1::uuid
          and status = 'active'
        order by created_at asc
      `,
      [user.id]
    )
  }

  const membership = memberships[0]
  if (!membership) {
    return { ok: false, status: 403, error: "Organization access denied" }
  }

  const organizationId = membership.organization_id
  const role = membership.role
  const allowedWorkspaceIds = canManageOrganization(role)
    ? (
        await queryRows<{ id: string }>(
          `
            select id::text
            from public.workspaces
            where organization_id = $1::uuid
              and archived_at is null
            order by is_default desc, created_at asc
          `,
          [organizationId]
        )
      ).map((workspace) => workspace.id)
    : (
        await queryRows<{ workspace_id: string }>(
          `
            select workspace_id::text
            from public.workspace_members
            where organization_id = $1::uuid
              and user_id = $2::uuid
          `,
          [organizationId, user.id]
        )
      ).map((workspace) => workspace.workspace_id)

  return {
    ok: true,
    context: {
      userId: user.id,
      userEmail: user.email || null,
      organizationId,
      role,
      allowedWorkspaceIds,
    },
  }
}

async function listDirectWorkspaces(context: DirectWorkspaceContext) {
  if (!canManageOrganization(context.role) && !context.allowedWorkspaceIds.length) {
    return []
  }

  return await queryRows<WorkspaceRow>(
    `
      select
        w.id::text,
        w.organization_id::text,
        w.name,
        w.slug,
        w.is_default,
        w.archived_at::text,
        w.created_at::text,
        exists (
          select 1
          from public.klaviyo_accounts ka
          where ka.organization_id = w.organization_id
            and ka.workspace_id = w.id
            and ka.active = true
        ) as has_connected_account,
        exists (
          select 1
          from public.stripe_accounts sa
          where sa.organization_id = w.organization_id
            and sa.workspace_id = w.id
            and sa.active = true
            and (
              nullif(sa.subscription_id, '') is not null
              or coalesce(sa.credits_plan, 0) > 0
              or coalesce(sa.overage_plan, 0) > 0
            )
        ) as has_active_billing,
        (
          select count(*)::int
          from public.workspace_members wm
          where wm.workspace_id = w.id
        ) as member_count
      from public.workspaces w
      where w.organization_id = $1::uuid
        and w.archived_at is null
        and (
          $2::boolean
          or w.id = any($3::uuid[])
        )
      order by w.is_default desc, w.created_at asc
    `,
    [
      context.organizationId,
      canManageOrganization(context.role),
      context.allowedWorkspaceIds,
    ]
  )
}

async function directGET(request: Request) {
  const resolved = await resolveDirectWorkspaceContext(request)
  if (!resolved.ok) {
    return errorJson(resolved.error, resolved.status)
  }

  return json(await listDirectWorkspaces(resolved.context))
}

async function directPOST(request: Request) {
  const resolved = await resolveDirectWorkspaceContext(request)
  if (!resolved.ok) {
    return errorJson(resolved.error, resolved.status)
  }

  const { context } = resolved
  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can create workspaces", 403)
  }

  const body = await readJsonBody(request)
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 80) {
    return errorJson("name must be a string up to 80 characters.", 400)
  }

  const activeWorkspace = await queryOne<{ count: number }>(
    `
      select count(*)::int
      from public.workspaces
      where organization_id = $1::uuid
        and archived_at is null
    `,
    [context.organizationId]
  )
  const isDefault = Number(activeWorkspace?.count || 0) === 0

  const workspace = await queryOne<WorkspaceRow>(
    `
      insert into public.workspaces (
        organization_id,
        name,
        slug,
        created_by_user_id,
        is_default
      )
      values ($1::uuid, $2::text, $3::text, $4::uuid, $5::boolean)
      returning
        id::text,
        organization_id::text,
        name,
        slug,
        is_default,
        archived_at::text,
        created_at::text,
        false as has_connected_account,
        false as has_active_billing,
        1 as member_count
    `,
    [
      context.organizationId,
      name,
      makeSlug(name, "workspace"),
      context.userId,
      isDefault,
    ]
  )

  if (!workspace) {
    return errorJson("Unable to create workspace")
  }

  const seededMembers = await queryRows<{ user_id: string }>(
    `
      insert into public.workspace_members (
        organization_id,
        workspace_id,
        user_id,
        role
      )
      select
        $1::uuid,
        $2::uuid,
        om.user_id,
        om.role
      from public.organization_members om
      where om.organization_id = $1::uuid
        and om.status = 'active'
        and om.role in ('owner', 'admin')
      on conflict (workspace_id, user_id) do update
        set role = excluded.role,
            updated_at = now()
      returning user_id::text
    `,
    [context.organizationId, workspace.id]
  )

  return json(
    { ...workspace, member_count: seededMembers.length },
    { status: 201 }
  )
}

async function directPATCH(request: Request) {
  const resolved = await resolveDirectWorkspaceContext(request)
  if (!resolved.ok) {
    return errorJson(resolved.error, resolved.status)
  }

  const { context } = resolved
  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can update workspaces", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  const name =
    body.name !== undefined && typeof body.name === "string"
      ? body.name.trim()
      : undefined
  if (body.name !== undefined && (!name || name.length > 80)) {
    return errorJson("name must be a string up to 80 characters.", 400)
  }

  const isDefault =
    body.is_default === undefined
      ? undefined
      : typeof body.is_default === "boolean"
        ? body.is_default
        : null
  if (isDefault === null) {
    return errorJson("is_default must be a boolean.", 400)
  }

  if (name === undefined && isDefault === undefined) {
    return errorJson("No updates provided.", 400)
  }

  if (isDefault === true) {
    await queryRows(
      `
        update public.workspaces
        set is_default = false,
            updated_at = now()
        where organization_id = $1::uuid
          and archived_at is null
      `,
      [context.organizationId]
    )
  }

  const workspace = await queryOne<WorkspaceRow>(
    `
      update public.workspaces
      set
        name = coalesce($3::text, name),
        is_default = coalesce($4::boolean, is_default),
        updated_at = now()
      where organization_id = $1::uuid
        and id = $2::uuid
        and archived_at is null
      returning
        id::text,
        organization_id::text,
        name,
        slug,
        is_default,
        archived_at::text,
        created_at::text,
        exists (
          select 1
          from public.klaviyo_accounts ka
          where ka.organization_id = workspaces.organization_id
            and ka.workspace_id = workspaces.id
            and ka.active = true
        ) as has_connected_account,
        exists (
          select 1
          from public.stripe_accounts sa
          where sa.organization_id = workspaces.organization_id
            and sa.workspace_id = workspaces.id
            and sa.active = true
            and (
              nullif(sa.subscription_id, '') is not null
              or coalesce(sa.credits_plan, 0) > 0
              or coalesce(sa.overage_plan, 0) > 0
            )
        ) as has_active_billing,
        (
          select count(*)::int
          from public.workspace_members wm
          where wm.workspace_id = workspaces.id
        ) as member_count
    `,
    [context.organizationId, id, name || null, isDefault ?? null]
  )

  if (!workspace) {
    return errorJson("Workspace not found", 404)
  }

  return json(workspace)
}

async function directDELETE(request: Request) {
  const resolved = await resolveDirectWorkspaceContext(request)
  if (!resolved.ok) {
    return errorJson(resolved.error, resolved.status)
  }

  const { context } = resolved
  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can archive workspaces", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  const workspace = await queryOne<{
    id: string
    is_default: boolean
  }>(
    `
      select id::text, is_default
      from public.workspaces
      where organization_id = $1::uuid
        and id = $2::uuid
        and archived_at is null
    `,
    [context.organizationId, id]
  )

  if (!workspace) {
    return errorJson("Workspace not found", 404)
  }

  const connectedAccounts = await queryOne<{ count: number }>(
    `
      select count(*)::int
      from public.klaviyo_accounts
      where organization_id = $1::uuid
        and workspace_id = $2::uuid
        and active = true
    `,
    [context.organizationId, id]
  )
  if (Number(connectedAccounts?.count || 0) > 0) {
    return errorJson(
      "Disconnect or move connected Klaviyo accounts before archiving this workspace.",
      400
    )
  }

  const activeBilling = await queryOne<{ count: number }>(
    `
      select count(*)::int
      from public.stripe_accounts
      where organization_id = $1::uuid
        and workspace_id = $2::uuid
        and active = true
        and (
          nullif(subscription_id, '') is not null
          or coalesce(credits_plan, 0) > 0
          or coalesce(overage_plan, 0) > 0
        )
    `,
    [context.organizationId, id]
  )
  if (Number(activeBilling?.count || 0) > 0) {
    return errorJson(
      "Cancel active billing before archiving this workspace.",
      400
    )
  }

  const archived = await queryOne<WorkspaceRow>(
    `
      update public.workspaces
      set archived_at = now(),
          is_default = false,
          updated_at = now()
      where organization_id = $1::uuid
        and id = $2::uuid
        and archived_at is null
      returning
        id::text,
        organization_id::text,
        name,
        slug,
        is_default,
        archived_at::text,
        created_at::text,
        false as has_connected_account,
        false as has_active_billing,
        (
          select count(*)::int
          from public.workspace_members wm
          where wm.workspace_id = workspaces.id
        ) as member_count
    `,
    [context.organizationId, id]
  )

  if (!archived) {
    return errorJson("Unable to archive workspace")
  }

  if (workspace.is_default) {
    await queryRows(
      `
        with next_default as (
          select id
          from public.workspaces
          where organization_id = $1::uuid
            and archived_at is null
          order by created_at asc
          limit 1
        )
        update public.workspaces
        set is_default = true,
            updated_at = now()
        where id = (select id from next_default)
      `,
      [context.organizationId]
    )
  }

  return json(archived)
}

export async function GET(request: Request) {
  if (isDirectDatabaseConfigured()) {
    return directGET(request)
  }

  const tenant = await resolveTenantContext(request, {
    ignoreWorkspaceScope: true,
  })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  let query = supabase
    .from("workspaces")
    .select(workspaceSelect)
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })

  if (!canManageOrganization(context.role)) {
    if (!context.allowedWorkspaceIds.length) {
      return json([])
    }
    query = query.in("id", context.allowedWorkspaceIds)
  }

  const { data, error } = await query
  if (error) {
    return errorJson(error.message)
  }

  const workspaceIds = (data || []).map((workspace) => String(workspace.id))
  const connectedCounts = new Map<string, boolean>()
  const activeBillingCounts = new Map<string, boolean>()
  const memberCounts = new Map<string, number>()

  if (workspaceIds.length) {
    const { data: connectedAccounts } = await supabase
      .from("klaviyo_accounts")
      .select("workspace_id")
      .eq("organization_id", context.organizationId)
      .in("workspace_id", workspaceIds)
      .eq("active", true)

    ;(connectedAccounts || []).forEach((row) => {
      if (row.workspace_id) {
        connectedCounts.set(String(row.workspace_id), true)
      }
    })

    const { data: billingAccounts } = await supabase
      .from("stripe_accounts")
      .select("workspace_id, subscription_id, credits_plan, overage_plan")
      .eq("organization_id", context.organizationId)
      .in("workspace_id", workspaceIds)
      .eq("active", true)

    ;(billingAccounts || []).forEach((row) => {
      const workspaceId = row.workspace_id ? String(row.workspace_id) : ""
      if (!workspaceId) {
        return
      }
      const hasActiveBilling =
        Boolean(row.subscription_id) ||
        Number(row.credits_plan || 0) > 0 ||
        Number(row.overage_plan || 0) > 0
      if (hasActiveBilling) {
        activeBillingCounts.set(workspaceId, true)
      }
    })

    const { data: workspaceMembers } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("organization_id", context.organizationId)
      .in("workspace_id", workspaceIds)

    ;(workspaceMembers || []).forEach((row) => {
      if (!row.workspace_id) {
        return
      }
      const workspaceId = String(row.workspace_id)
      memberCounts.set(workspaceId, (memberCounts.get(workspaceId) || 0) + 1)
    })
  }

  return json(
    (data || []).map((workspace) => ({
      ...workspace,
      has_connected_account: connectedCounts.get(String(workspace.id)) || false,
      has_active_billing:
        activeBillingCounts.get(String(workspace.id)) || false,
      member_count: memberCounts.get(String(workspace.id)) || 0,
    }))
  )
}

export async function POST(request: Request) {
  if (isDirectDatabaseConfigured()) {
    return directPOST(request)
  }

  const tenant = await resolveTenantContext(request, {
    ignoreWorkspaceScope: true,
  })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can create workspaces", 403)
  }

  const body = await readJsonBody(request)
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 80) {
    return errorJson("name must be a string up to 80 characters.", 400)
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      organization_id: context.organizationId,
      name,
      slug: makeSlug(name, "workspace"),
      created_by_user_id: context.user?.id,
      is_default: false,
    })
    .select(workspaceSelect)
    .single()

  if (error || !workspace) {
    return errorJson(error?.message || "Unable to create workspace")
  }

  const { data: organizationManagers, error: managerError } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .in("role", ["owner", "admin"])

  if (managerError) {
    return errorJson(managerError.message)
  }

  if (organizationManagers?.length) {
    const { error: workspaceMemberError } = await supabase
      .from("workspace_members")
      .upsert(
        organizationManagers.map((member) => ({
          organization_id: context.organizationId,
          workspace_id: workspace.id,
          user_id: member.user_id,
          role: member.role,
        })),
        { onConflict: "workspace_id,user_id" }
      )

    if (workspaceMemberError) {
      return errorJson(workspaceMemberError.message)
    }
  }

  return json(
    {
      ...workspace,
      has_connected_account: false,
      has_active_billing: false,
      member_count: organizationManagers?.length || 0,
    },
    { status: 201 }
  )
}

export async function PATCH(request: Request) {
  if (isDirectDatabaseConfigured()) {
    return directPATCH(request)
  }

  const tenant = await resolveTenantContext(request, {
    ignoreWorkspaceScope: true,
  })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can update workspaces", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name || name.length > 80) {
      return errorJson("name must be a string up to 80 characters.", 400)
    }
    updates.name = name
  }

  if (body.is_default !== undefined) {
    if (typeof body.is_default !== "boolean") {
      return errorJson("is_default must be a boolean.", 400)
    }
    updates.is_default = body.is_default
  }

  if (!Object.keys(updates).length) {
    return errorJson("No updates provided.", 400)
  }

  if (updates.is_default === true) {
    await supabase
      .from("workspaces")
      .update({ is_default: false })
      .eq("organization_id", context.organizationId)
      .is("archived_at", null)
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .select(workspaceSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Workspace not found", 404)
  }

  return json(data)
}

export async function DELETE(request: Request) {
  if (isDirectDatabaseConfigured()) {
    return directDELETE(request)
  }

  const tenant = await resolveTenantContext(request, {
    ignoreWorkspaceScope: true,
  })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!context.organizationId) {
    return errorJson("Organization access required", 403)
  }

  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can archive workspaces", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) {
    return errorJson("id must be a string.", 400)
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select(workspaceSelect)
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .single()

  if (workspaceError || !workspace) {
    return errorJson(workspaceError?.message || "Workspace not found", 404)
  }

  const { count: connectedAccounts, error: connectedAccountsError } =
    await supabase
      .from("klaviyo_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("workspace_id", id)
      .eq("active", true)

  if (connectedAccountsError) {
    return errorJson(connectedAccountsError.message)
  }

  if ((connectedAccounts || 0) > 0) {
    return errorJson(
      "Disconnect or move connected Klaviyo accounts before archiving this workspace.",
      400
    )
  }

  const { data: billingAccounts, error: billingAccountsError } = await supabase
    .from("stripe_accounts")
    .select("subscription_id, credits_plan, overage_plan")
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", id)
    .eq("active", true)

  if (billingAccountsError) {
    return errorJson(billingAccountsError.message)
  }

  const hasActiveBilling = (billingAccounts || []).some(
    (account) =>
      Boolean(account.subscription_id) ||
      Number(account.credits_plan || 0) > 0 ||
      Number(account.overage_plan || 0) > 0
  )
  if (hasActiveBilling) {
    return errorJson(
      "Cancel active billing before archiving this workspace.",
      400
    )
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update({ archived_at: new Date().toISOString(), is_default: false })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .select(workspaceSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Unable to archive workspace")
  }

  if (workspace.is_default) {
    const { data: nextDefault, error: nextDefaultError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", context.organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (nextDefaultError) {
      return errorJson(nextDefaultError.message)
    }

    if (nextDefault) {
      const { error: promoteError } = await supabase
        .from("workspaces")
        .update({ is_default: true })
        .eq("organization_id", context.organizationId)
        .eq("id", nextDefault.id)

      if (promoteError) {
        return errorJson(promoteError.message)
      }
    }
  }

  return json(data)
}
