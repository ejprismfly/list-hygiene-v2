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

export const validManagedMemberRole = (
  role: unknown
): role is ManagedMemberRole => {
  return role === "admin" || role === "member"
}

export async function findTeamMemberProfileByEmail(
  supabase: SupabaseClient,
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase()
  const escapedEmail = normalizedEmail.replace(/[\\%_]/g, (value) => `\\${value}`)
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
  const { data: member, error } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: profile.user_id,
        role,
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

  if (workspaceIds.length) {
    const { error: workspaceError } = await supabase
      .from("workspace_members")
      .upsert(
        workspaceIds.map((workspaceId) => ({
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
    const escapedEmail = email.trim().toLowerCase().replace(/[\\%_]/g, (value) => `\\${value}`)
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
      .select("workspace_id")
      .eq("organization_id", organizationId)
      .eq("user_id", profile.user_id)

  if (workspaceLookupError) {
    return { ok: false as const, error: workspaceLookupError.message }
  }

  return {
    ok: true as const,
    member: {
      ...member,
      email: profile.email,
      name: profile.name,
      workspace_ids: (workspaceMemberships || []).map((row) =>
        String(row.workspace_id)
      ),
    } as TeamMemberResponse,
  }
}
