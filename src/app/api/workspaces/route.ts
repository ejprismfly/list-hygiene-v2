import {
  canManageOrganization,
  errorJson,
  json,
  makeSlug,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"

const workspaceSelect =
  "id, organization_id, name, slug, is_default, archived_at, created_at"

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request)
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
      member_count: memberCounts.get(String(workspace.id)) || 0,
    }))
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

  await supabase.from("workspace_members").upsert(
    {
      organization_id: context.organizationId,
      workspace_id: workspace.id,
      user_id: context.user?.id,
      role: context.role,
    },
    { onConflict: "workspace_id,user_id" }
  )

  return json(
    {
      ...workspace,
      has_connected_account: false,
      member_count: 1,
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
  const tenant = await resolveTenantContext(request)
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

  if (workspace.is_default) {
    return errorJson("Default workspace cannot be archived.", 400)
  }

  const { count: workspaceCount, error: workspaceCountError } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)

  if (workspaceCountError) {
    return errorJson(workspaceCountError.message)
  }

  if ((workspaceCount || 0) <= 1) {
    return errorJson("At least one active workspace is required.", 400)
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

  const { data, error } = await supabase
    .from("workspaces")
    .update({ archived_at: new Date().toISOString() })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .select(workspaceSelect)
    .single()

  if (error || !data) {
    return errorJson(error?.message || "Unable to archive workspace")
  }

  return json(data)
}
