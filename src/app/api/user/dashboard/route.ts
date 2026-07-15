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
  type DashboardHistoricalPoint,
} from "@/lib/dashboard/report"

type CountOptions = {
  from?: string
  to?: string
  tagged?: boolean
  suppress?: boolean
  category?: DashboardCategory
  typoFixed?: boolean
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  const now = new Date()
  const monthRange = getCurrentMonthRange(now)

  function scopedEmailCountQuery() {
    const query = supabase
      .from("emails")
      .select("id", { count: "exact", head: true })

    if (context.legacyFallback || !context.organizationId) {
      return query.eq("user_id", context.user?.id)
    }

    let scoped = query.eq("organization_id", context.organizationId)
    if (context.workspaceId) {
      scoped = scoped.eq("workspace_id", context.workspaceId)
    } else if (!canManageOrganization(context.role)) {
      scoped = scoped.in("workspace_id", context.allowedWorkspaceIds)
    }

    return scoped
  }

  function scopedHistoricalQuery() {
    const query = supabase
      .from("emails_historical_performance")
      .select("month, valid, invalid, risky, restricted, start, order_id")

    if (context.legacyFallback || !context.organizationId) {
      return query.eq("user_id", context.user?.id)
    }

    let scoped = query.eq("organization_id", context.organizationId)
    if (context.workspaceId) {
      scoped = scoped.eq("workspace_id", context.workspaceId)
    } else if (!canManageOrganization(context.role)) {
      scoped = scoped.in("workspace_id", context.allowedWorkspaceIds)
    }

    return scoped
  }

  async function countEmails(options: CountOptions = {}) {
    let query = scopedEmailCountQuery()

    if (options.tagged !== undefined) {
      query = query.eq("tagged", options.tagged)
    }

    if (options.suppress !== undefined) {
      query = query.eq("suppress", options.suppress)
    }

    if (options.category) {
      query = query.eq("lh_category", options.category)
    }

    if (options.typoFixed !== undefined) {
      query = query.eq("typo_fixed", options.typoFixed)
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

  async function loadHistorical(): Promise<DashboardHistoricalPoint[]> {
    const query = scopedHistoricalQuery()
      .order("start", { ascending: false })
      .limit(12)

    const { data, error } = await query
    if (error) {
      console.warn("Dashboard historical lookup failed:", error.message)
      return []
    }

    return (data || [])
      .reverse()
      .map((row) => ({
        month: String(row.month || ""),
        valid: Number(row.valid || 0),
        invalid: Number(row.invalid || 0),
        risky: Number(row.risky || 0),
        restricted: Number(row.restricted || 0),
      }))
  }

  try {
    const [
      totalSuppressed,
      monthTotalTagged,
      monthSuppressed,
      typoFixes,
      historical,
      ...categories
    ] =
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
        countEmails({
          tagged: true,
          typoFixed: true,
          from: monthRange.start,
          to: monthRange.end,
        }),
        loadHistorical(),
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
        typoFixes,
        historical,
        chart,
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dashboard"
    return errorJson(message)
  }
}
