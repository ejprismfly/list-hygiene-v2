import {
  canManageOrganization,
  errorJson,
  json,
  resolveTenantContext,
} from "@/lib/api/tenant"
import {
  DASHBOARD_CATEGORY_BREAKDOWN_METRICS,
  createEmptyDashboardCategoryBreakdownCategories,
  getDashboardCategoryForBreakdownMetric,
} from "@/lib/dashboard/breakdown"
import {
  DASHBOARD_CATEGORY_KEYS,
  buildDashboardReport,
  getCurrentMonthRange,
  type DashboardCategory,
  type DashboardCategoryBreakdownPoint,
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

type CurrentMonthReport = {
  total_count: number | null
  suppressed_count: number | null
  valid_count: number | null
  invalid_count: number | null
  risky_count: number | null
  restricted_count: number | null
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

  function scopedBreakdownQuery() {
    const query = supabase
      .from("email_usage_breakdown_monthly")
      .select("month_start, metric, key, count, sort_idx")
      .in("metric", DASHBOARD_CATEGORY_BREAKDOWN_METRICS)

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

  function scopedCurrentMonthReportQuery() {
    const query = supabase
      .from("email_report_tbl")
      .select(
        "total_count, suppressed_count, valid_count, invalid_count, risky_count, restricted_count, updated_at"
      )

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

  async function loadCategoryBreakdown(): Promise<DashboardCategoryBreakdownPoint[]> {
    const query = scopedBreakdownQuery()
      .order("month_start", { ascending: false })
      .order("sort_idx", { ascending: true })
      .limit(12 * 27)

    const { data, error } = await query
    if (error) {
      console.warn("Dashboard category breakdown lookup failed:", error.message)
      return []
    }

    const rowsByMonth = new Map<string, DashboardCategoryBreakdownPoint>()

    for (const row of data || []) {
      const monthStart = String(row.month_start || "")
      if (!monthStart) {
        continue
      }

      const category = getDashboardCategoryForBreakdownMetric(String(row.metric || ""))
      if (!category) {
        continue
      }

      const existing =
        rowsByMonth.get(monthStart) ||
        {
          month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(
            new Date(`${monthStart}T00:00:00Z`)
          ),
          monthStart,
          sortIdx: Number(row.sort_idx || 0),
          categories: createEmptyDashboardCategoryBreakdownCategories(),
        }

      existing.categories[category][String(row.key || "")] = Number(row.count || 0)
      existing.sortIdx = Math.min(existing.sortIdx ?? 0, Number(row.sort_idx || 0))
      rowsByMonth.set(monthStart, existing)
    }

    return Array.from(rowsByMonth.values()).reverse()
  }

  async function loadCurrentMonthReport(): Promise<CurrentMonthReport | null> {
    const { data, error } = await scopedCurrentMonthReportQuery()
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn("Dashboard current month report lookup failed:", error.message)
      return null
    }

    return data
      ? {
          total_count: Number(data.total_count || 0),
          suppressed_count: Number(data.suppressed_count || 0),
          valid_count: Number(data.valid_count || 0),
          invalid_count: Number(data.invalid_count || 0),
          risky_count: Number(data.risky_count || 0),
          restricted_count: Number(data.restricted_count || 0),
        }
      : null
  }

  try {
    const [
      totalSuppressed,
      monthTotalTagged,
      monthSuppressed,
      typoFixes,
      historical,
      categoryBreakdown,
      currentMonthReport,
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
        loadCategoryBreakdown(),
        loadCurrentMonthReport(),
        ...DASHBOARD_CATEGORY_KEYS.map((category) =>
          countEmails({
            tagged: true,
            category,
            from: monthRange.start,
            to: monthRange.end,
          })
        ),
      ])

    const chart: Record<DashboardCategory, number> = currentMonthReport
      ? {
          valid: Number(currentMonthReport.valid_count || 0),
          invalid: Number(currentMonthReport.invalid_count || 0),
          risky: Number(currentMonthReport.risky_count || 0),
          restricted: Number(currentMonthReport.restricted_count || 0),
        }
      : DASHBOARD_CATEGORY_KEYS.reduce<Record<DashboardCategory, number>>(
          (result, category, index) => {
            result[category] = categories[index] ?? 0
            return result
          },
          { valid: 0, invalid: 0, risky: 0, restricted: 0 }
        )

    return json(
      buildDashboardReport({
        totalSuppressed,
        monthTotalTagged: Number(
          currentMonthReport?.total_count ?? monthTotalTagged
        ),
        monthSuppressed: Number(
          currentMonthReport?.suppressed_count ?? monthSuppressed
        ),
        typoFixes,
        categoryBreakdown,
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
