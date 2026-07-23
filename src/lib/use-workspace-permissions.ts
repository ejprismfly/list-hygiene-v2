"use client"

import { useEffect, useState } from "react"

import {
  loadOrganizations,
  loadWorkspaces,
  type WorkspaceOption,
} from "@/lib/workspace-client-data"
import { readWorkspaceSelection } from "@/lib/workspace-utils"

export type WorkspaceRole = "owner" | "admin" | "member"

function canManage(role?: WorkspaceRole | null) {
  return role === "owner" || role === "admin"
}

export function useWorkspacePermissions() {
  const [loading, setLoading] = useState(true)
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSelection() {
      setLoading(true)
      try {
        const selection = readWorkspaceSelection(window.localStorage)
        const organizations = await loadOrganizations()
        const organization =
          organizations.find((item) => item.id === selection.organizationId) ||
          organizations[0] ||
          null

        if (!organization) {
          if (!cancelled) {
            setWorkspace(null)
          }
          return
        }

        const workspaces = await loadWorkspaces(organization.id)
        const selectedWorkspace =
          workspaces.find((item) => item.id === selection.workspaceId) ||
          workspaces.find((item) => item.is_default) ||
          workspaces[0] ||
          null

        if (!cancelled) {
          setWorkspace(selectedWorkspace)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSelection().catch(() => {
      if (!cancelled) {
        setWorkspace(null)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const role = workspace?.role || null

  return {
    loading,
    workspace,
    role,
    canManageWorkspace: canManage(role),
    canOwnWorkspace: role === "owner",
    canCreateIntegrations: canManage(role),
    canUpdateIntegrations: role === "owner" || role === "admin" || role === "member",
    canDeleteIntegrations: canManage(role),
  }
}
