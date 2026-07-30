"use client"

import { pushDataLayerEvent, type DataLayerPayload } from "@/lib/analytics"

export const TRACKING_EVENTS = {
  auth: {
    loginSubmitted: "lh_login_submitted",
    signupSubmitted: "lh_signup_submitted",
    signupConfirmationSent: "lh_signup_confirmation_sent",
    signupConfirmationResent: "lh_signup_confirmation_resent",
    passwordResetRequested: "lh_password_reset_requested",
    passwordResetSent: "lh_password_reset_sent",
    passwordUpdateSubmitted: "lh_password_update_submitted",
    inviteAcceptStarted: "lh_invite_accept_started",
    inviteAcceptSucceeded: "lh_invite_accept_succeeded",
    inviteAcceptFailed: "lh_invite_accept_failed",
  },
  integration: {
    klaviyoOauthStarted: "lh_klaviyo_oauth_started",
    klaviyoConnected: "lh_klaviyo_connected",
    klaviyoDuplicateBlocked: "lh_klaviyo_duplicate_blocked",
    klaviyoOauthFailed: "lh_klaviyo_oauth_failed",
    klaviyoConnectionUpdated: "lh_klaviyo_connection_updated",
    klaviyoSegmentsRefreshed: "lh_klaviyo_segments_refreshed",
    klaviyoDisconnected: "lh_klaviyo_disconnected",
  },
  workspace: {
    switchStarted: "lh_workspace_switch_started",
    created: "lh_workspace_created",
    updated: "lh_workspace_updated",
    deleteBlocked: "lh_workspace_delete_blocked",
    deleted: "lh_workspace_deleted",
    ownershipTransferred: "lh_workspace_ownership_transferred",
  },
  team: {
    memberAdded: "lh_team_member_added",
    memberInvited: "lh_team_member_invited",
    inviteResent: "lh_team_invite_resent",
    inviteCancelled: "lh_team_invite_cancelled",
    memberRoleUpdated: "lh_team_member_role_updated",
    memberRemoved: "lh_team_member_removed",
  },
} as const

export type TrackingScope = {
  organizationId?: string | null
  workspaceId?: string | null
  role?: string | null
}

function scopePayload(scope?: TrackingScope | null) {
  return {
    organization_id: scope?.organizationId || null,
    workspace_id: scope?.workspaceId || null,
    workspace_role: scope?.role || null,
  } satisfies DataLayerPayload
}

function trackProductEvent(
  event: string,
  category: string,
  payload: DataLayerPayload = {}
) {
  pushDataLayerEvent(event, {
    event_category: category,
    ...payload,
  })
}

export function trackAuthEvent(
  event: (typeof TRACKING_EVENTS.auth)[keyof typeof TRACKING_EVENTS.auth],
  payload: DataLayerPayload = {}
) {
  trackProductEvent(event, "auth", payload)
}

export function trackIntegrationEvent(
  event: (typeof TRACKING_EVENTS.integration)[keyof typeof TRACKING_EVENTS.integration],
  scope?: TrackingScope | null,
  payload: DataLayerPayload = {}
) {
  trackProductEvent(event, "integration", {
    ...scopePayload(scope),
    provider: "klaviyo",
    ...payload,
  })
}

export function trackWorkspaceEvent(
  event: (typeof TRACKING_EVENTS.workspace)[keyof typeof TRACKING_EVENTS.workspace],
  scope?: TrackingScope | null,
  payload: DataLayerPayload = {}
) {
  trackProductEvent(event, "workspace", {
    ...scopePayload(scope),
    ...payload,
  })
}

export function trackTeamEvent(
  event: (typeof TRACKING_EVENTS.team)[keyof typeof TRACKING_EVENTS.team],
  scope?: TrackingScope | null,
  payload: DataLayerPayload = {}
) {
  trackProductEvent(event, "team", {
    ...scopePayload(scope),
    ...payload,
  })
}
