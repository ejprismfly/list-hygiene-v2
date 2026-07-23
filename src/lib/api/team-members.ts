import type { SupabaseClient } from "@supabase/supabase-js"

import type { OrganizationRole } from "@/lib/api/tenant"

export type ManagedMemberRole = Exclude<OrganizationRole, "owner">

export type TeamMemberProfile = {
  user_id: string
  email: string | null
  name: string | null
}

export type TeamMemberResponse = {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationRole
  status: "active" | "disabled" | "invited"
  created_at: string
  email: string | null
  name: string | null
  workspace_ids: string[]
}

const roleRank: Record<OrganizationRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
}

export const validManagedMemberRole = (
  role: unknown
): role is ManagedMemberRole => {
  return role === "admin" || role === "member"
}

export function normalizeWorkspaceIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(value.filter((id): id is string => typeof id === "string" && !!id))
  )
}

function escapeLikeValue(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function preserveHighestRole(
  existingRole: OrganizationRole | null | undefined,
  requestedRole: ManagedMemberRole
): OrganizationRole {
  if (!existingRole) {
    return requestedRole
  }

  return roleRank[existingRole] > roleRank[requestedRole]
    ? existingRole
    : requestedRole
}

export async function resolveTeamWorkspaceIds({
  organizationId,
  supabase,
  workspaceIds,
}: {
  organizationId: string
  supabase: SupabaseClient
  workspaceIds: string[]
}) {
  if (!workspaceIds.length) {
    return {
      ok: false as const,
      error: "Team members must have at least one workspace.",
    }
  }

  const { count, error } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("id", workspaceIds)

  if (error) {
    return { ok: false as const, error: error.message }
  }

  if (count !== workspaceIds.length) {
    return {
      ok: false as const,
      error: "One or more workspaces are invalid.",
    }
  }

  return { ok: true as const, workspaceIds }
}

export async function findTeamMemberProfileByEmail(
  supabase: SupabaseClient,
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase()
  const escapedEmail = escapeLikeValue(normalizedEmail)
  const { data, error } = await supabase
    .from("user_details")
    .select("user_id, email, name")
    .ilike("email", escapedEmail)
    .limit(2)

  if (error) {
    return { ok: false as const, error: error.message }
  }

  const profile = (data || []).find((row) => {
    return (
      typeof row.email === "string" &&
      row.email.trim().toLowerCase() === normalizedEmail
    )
  })

  return {
    ok: true as const,
    profile: profile
      ? {
          user_id: String(profile.user_id),
          email: typeof profile.email === "string" ? profile.email : null,
          name: typeof profile.name === "string" ? profile.name : null,
        }
      : null,
  }
}

export async function addExistingUserToTeam({
  acceptedInvitationId,
  email,
  invitedByUserId,
  organizationId,
  profile,
  role,
  supabase,
  workspaceIds,
}: {
  acceptedInvitationId?: string
  email?: string
  invitedByUserId?: string
  organizationId: string
  profile: TeamMemberProfile
  role: ManagedMemberRole
  supabase: SupabaseClient
  workspaceIds: string[]
}) {
  const { data: existingMember, error: existingMemberError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", profile.user_id)
    .maybeSingle()

  if (existingMemberError) {
    return { ok: false as const, error: existingMemberError.message }
  }

  const organizationRole = preserveHighestRole(
    existingMember?.role as OrganizationRole | null | undefined,
    role
  )
  const resolvedWorkspaceIds = await resolveTeamWorkspaceIds({
    organizationId,
    supabase,
    workspaceIds,
  })

  if (!resolvedWorkspaceIds.ok) {
    return resolvedWorkspaceIds
  }

  const { data: member, error } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: profile.user_id,
        role: organizationRole,
        status: "active",
        invited_by_user_id: invitedByUserId,
      },
      { onConflict: "organization_id,user_id" }
    )
    .select("id, organization_id, user_id, role, status, created_at")
    .single()

  if (error || !member) {
    return { ok: false as const, error: error?.message || "Unable to add member" }
  }

  if (resolvedWorkspaceIds.workspaceIds.length) {
    const { error: workspaceError } = await supabase
      .from("workspace_members")
      .upsert(
        resolvedWorkspaceIds.workspaceIds.map((workspaceId) => ({
          organization_id: organizationId,
          workspace_id: workspaceId,
          user_id: profile.user_id,
          role,
        })),
        { onConflict: "workspace_id,user_id" }
      )

    if (workspaceError) {
      return { ok: false as const, error: workspaceError.message }
    }
  }

  if (acceptedInvitationId) {
    const acceptedAt = new Date().toISOString()
    const { error: invitationError } = await supabase
      .from("organization_invitations")
      .update({
        status: "accepted",
        accepted_by_user_id: profile.user_id,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq("organization_id", organizationId)
      .eq("id", acceptedInvitationId)
      .eq("status", "pending")

    if (invitationError) {
      return { ok: false as const, error: invitationError.message }
    }
  } else if (email) {
    const acceptedAt = new Date().toISOString()
    const escapedEmail = escapeLikeValue(email.trim().toLowerCase())
    const { error: invitationError } = await supabase
      .from("organization_invitations")
      .update({
        status: "accepted",
        accepted_by_user_id: profile.user_id,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq("organization_id", organizationId)
      .ilike("email", escapedEmail)
      .eq("status", "pending")

    if (invitationError) {
      return { ok: false as const, error: invitationError.message }
    }
  }

  const { data: workspaceMemberships, error: workspaceLookupError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("organization_id", organizationId)
      .eq("user_id", profile.user_id)

  if (workspaceLookupError) {
    return { ok: false as const, error: workspaceLookupError.message }
  }

  return {
    ok: true as const,
    member: {
      ...member,
      role,
      email: profile.email,
      name: profile.name,
      workspace_ids: (workspaceMemberships || []).map((row) =>
        String(row.workspace_id)
      ),
    } as TeamMemberResponse,
  }
}
