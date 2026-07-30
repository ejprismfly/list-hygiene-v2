import type { AppUser } from "@/lib/app-session"
import { isOnboardingPath, SIGNUP_ONBOARDING_COOKIE } from "@/lib/onboarding"
import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

type OrganizationMembership = {
  organization_id: string
  role: string | null
}

type WorkspaceMembership = {
  workspace_id: string | null
}

type WorkspaceRow = {
  id: string
}

type KlaviyoAccountRow = {
  id: string
}

function hasOrganizationWideWorkspaceAccess(role?: string | null) {
  return role === "owner" || role === "admin"
}

async function userHasKlaviyoIntegrationHistory(userId: string) {
  const supabase = await createClient()

  const { data: ownedAccounts, error: ownedAccountsError } = await supabase
    .from("klaviyo_accounts")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .returns<KlaviyoAccountRow[]>()

  if (ownedAccountsError) {
    console.error("Onboarding Klaviyo owner lookup failed:", ownedAccountsError)
    return true
  }

  if (ownedAccounts?.length) {
    return true
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .returns<OrganizationMembership[]>()

  if (membershipError) {
    console.error("Onboarding organization lookup failed:", membershipError)
    return true
  }

  const organizationIds = Array.from(
    new Set((memberships || []).map((membership) => membership.organization_id))
  )
  if (!organizationIds.length) {
    return false
  }

  const organizationWideIds = memberships
    ?.filter((membership) => hasOrganizationWideWorkspaceAccess(membership.role))
    .map((membership) => membership.organization_id)

  const workspaceIds = new Set<string>()
  const { data: workspaceMemberships, error: workspaceMembershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .in("organization_id", organizationIds)
      .returns<WorkspaceMembership[]>()

  if (workspaceMembershipError) {
    console.error("Onboarding workspace membership lookup failed:", {
      user_id: userId,
      error: workspaceMembershipError,
    })
    return true
  }

  ;(workspaceMemberships || []).forEach((membership) => {
    if (membership.workspace_id) {
      workspaceIds.add(membership.workspace_id)
    }
  })

  if (organizationWideIds?.length) {
    const { data: organizationWorkspaces, error: organizationWorkspaceError } =
      await supabase
        .from("workspaces")
        .select("id")
        .in("organization_id", organizationWideIds)
        .returns<WorkspaceRow[]>()

    if (organizationWorkspaceError) {
      console.error("Onboarding organization workspace lookup failed:", {
        user_id: userId,
        error: organizationWorkspaceError,
      })
      return true
    }

    ;(organizationWorkspaces || []).forEach((workspace) => {
      workspaceIds.add(workspace.id)
    })
  }

  const accessibleWorkspaceIds = Array.from(workspaceIds)
  if (accessibleWorkspaceIds.length) {
    const { data: workspaceAccounts, error: workspaceAccountsError } =
      await supabase
        .from("klaviyo_accounts")
        .select("id")
        .in("workspace_id", accessibleWorkspaceIds)
        .limit(1)
        .returns<KlaviyoAccountRow[]>()

    if (workspaceAccountsError) {
      console.error("Onboarding workspace Klaviyo lookup failed:", {
        user_id: userId,
        error: workspaceAccountsError,
      })
      return true
    }

    if (workspaceAccounts?.length) {
      return true
    }
  }

  const { data: legacyOrgAccounts, error: legacyOrgAccountsError } =
    await supabase
      .from("klaviyo_accounts")
      .select("id")
      .in("organization_id", organizationIds)
      .is("workspace_id", null)
      .limit(1)
      .returns<KlaviyoAccountRow[]>()

  if (legacyOrgAccountsError) {
    console.error("Onboarding legacy Klaviyo lookup failed:", {
      user_id: userId,
      error: legacyOrgAccountsError,
    })
    return true
  }

  return Boolean(legacyOrgAccounts?.length)
}

export async function shouldShowOnboardingForUser(user: AppUser) {
  if (user.isPreview || !getSupabaseConfig()) {
    return false
  }

  const hasIntegrationHistory = await userHasKlaviyoIntegrationHistory(user.id)

  return !hasIntegrationHistory
}

export function shouldUseSignupOnboardingMarker(
  nextPath: string,
  authType?: string | null
) {
  return authType === "signup" && isOnboardingPath(nextPath)
}

export { SIGNUP_ONBOARDING_COOKIE }
