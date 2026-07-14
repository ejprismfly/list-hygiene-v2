import {
  canManageOrganization,
  errorJson,
  json,
  resolveTenantContext,
} from "@/lib/api/tenant"
import {
  DASHBOARD_CATEGORY_KEYS,
  buildDashboardReport,
  getCurrentMonthRange,
  type DashboardCategory,
} from "@/lib/dashboard/report"

type CountOptions = {
  from?: string
  to?: string
  tagged?: boolean
  suppress?: boolean
  category?: DashboardCategory
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  const now = new Date()
  const monthRange = getCurrentMonthRange(now)

  async function countEmails(options: CountOptions = {}) {
    let query = supabase
      .from("emails")
      .select("id", { count: "exact", head: true })

    if (context.legacyFallback || !context.organizationId) {
      query = query.eq("user_id", context.user?.id)
    } else {
      query = query.eq("organization_id", context.organizationId)
      if (context.workspaceId) {
        query = query.eq("workspace_id", context.workspaceId)
      } else if (!canManageOrganization(context.role)) {
        query = query.in("workspace_id", context.allowedWorkspaceIds)
      }
    }

    if (options.tagged !== undefined) {
      query = query.eq("tagged", options.tagged)
    }

    if (options.suppress !== undefined) {
      query = query.eq("suppress", options.suppress)
    }

    if (options.category) {
      query = query.eq("lh_category", options.category)
    }

    if (options.from) {
      query = query.gte("created_at", options.from)
    }

    if (options.to) {
      query = query.lte("created_at", options.to)
    }

    const { count, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    return count ?? 0
  }

  try {
    const [totalSuppressed, monthTotalTagged, monthSuppressed, ...categories] =
      await Promise.all([
        countEmails({ tagged: true, suppress: true }),
        countEmails({
          tagged: true,
          from: monthRange.start,
          to: monthRange.end,
        }),
        countEmails({
          tagged: true,
          suppress: true,
          from: monthRange.start,
          to: monthRange.end,
        }),
        ...DASHBOARD_CATEGORY_KEYS.map((category) =>
          countEmails({
            tagged: true,
            category,
            from: monthRange.start,
            to: monthRange.end,
          })
        ),
      ])

    const chart = DASHBOARD_CATEGORY_KEYS.reduce<Record<DashboardCategory, number>>(
      (result, category, index) => {
        result[category] = categories[index] ?? 0
        return result
      },
      { valid: 0, invalid: 0, risky: 0, restricted: 0 }
    )

    return json(
      buildDashboardReport({
        totalSuppressed,
        monthTotalTagged,
        monthSuppressed,
        chart,
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dashboard"
    return errorJson(message)
  }
}
