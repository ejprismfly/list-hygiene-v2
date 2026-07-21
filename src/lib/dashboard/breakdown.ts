import {
  DASHBOARD_CATEGORY_KEYS,
  type DashboardCategory,
  type DashboardCategoryBreakdownPoint,
  type DashboardHistoricalPoint,
} from "@/lib/dashboard/report"

export type DashboardCategoryBreakdownSegment = {
  key: string
  label: string
  color: string
  fallbackWeight: number
}

const categoryBreakdownColors = [
  "#3f5d9f",
  "#7895cc",
  "#6d54a8",
  "#a65397",
  "#f25292",
  "#dc3f4e",
  "#fb7133",
  "#ff9f0a",
  "#42cdb1",
  "#0b9f95",
  "#bfdc3e",
]

export const DASHBOARD_CATEGORY_BREAKDOWN_CONFIG: Record<
  DashboardCategory,
  {
    metric: string
    segments: DashboardCategoryBreakdownSegment[]
  }
> = {
  valid: {
    metric: "attempts",
    segments: [
      {
        key: "valid_first",
        label: "Valid",
        color: categoryBreakdownColors[0],
        fallbackWeight: 9,
      },
      {
        key: "valid_secondary",
        label: "Secondary",
        color: categoryBreakdownColors[1],
        fallbackWeight: 1,
      },
    ],
  },
  invalid: {
    metric: "bounce_reason",
    segments: [
      {
        key: "no_mail_accepted",
        label: "No mail accepted",
        color: categoryBreakdownColors[0],
        fallbackWeight: 13,
      },
      {
        key: "wrong_format",
        label: "Invalid email format",
        color: categoryBreakdownColors[1],
        fallbackWeight: 8,
      },
      {
        key: "no_mailbox",
        label: "No mailbox",
        color: categoryBreakdownColors[2],
        fallbackWeight: 12,
      },
      {
        key: "no_dns",
        label: "No DNS",
        color: categoryBreakdownColors[3],
        fallbackWeight: 9,
      },
      {
        key: "full_mailbox",
        label: "Full mailbox",
        color: categoryBreakdownColors[4],
        fallbackWeight: 6,
      },
      {
        key: "unreachable_domain",
        label: "Unreachable domain",
        color: categoryBreakdownColors[5],
        fallbackWeight: 11,
      },
      {
        key: "anti_spam",
        label: "Anti-spam system",
        color: categoryBreakdownColors[6],
        fallbackWeight: 11,
      },
      {
        key: "smtp_failed",
        label: "SMTP failure",
        color: categoryBreakdownColors[7],
        fallbackWeight: 10,
      },
      {
        key: "connection_dropped",
        label: "Connection dropped",
        color: categoryBreakdownColors[8],
        fallbackWeight: 6,
      },
      {
        key: "mail_server_no_response",
        label: "Mail server did not respond",
        color: categoryBreakdownColors[9],
        fallbackWeight: 8,
      },
      {
        key: "connection_timeout",
        label: "Connection timeout",
        color: categoryBreakdownColors[10],
        fallbackWeight: 6,
      },
    ],
  },
  risky: {
    metric: "risk_flag",
    segments: [
      {
        key: "typo",
        label: "Typo",
        color: categoryBreakdownColors[0],
        fallbackWeight: 18,
      },
      {
        key: "catch_all",
        label: "Catch-all",
        color: categoryBreakdownColors[1],
        fallbackWeight: 16,
      },
      {
        key: "possible_trap",
        label: "Possible spam trap",
        color: categoryBreakdownColors[2],
        fallbackWeight: 11,
      },
      {
        key: "role_based",
        label: "Role-based",
        color: categoryBreakdownColors[3],
        fallbackWeight: 11,
      },
      {
        key: "temporary_email",
        label: "Temporary",
        color: categoryBreakdownColors[4],
        fallbackWeight: 8,
      },
      {
        key: "high_risk",
        label: "High risk (bots)",
        color: categoryBreakdownColors[5],
        fallbackWeight: 10,
      },
      {
        key: "role_based_catch_all",
        label: "Role-based catch-all",
        color: categoryBreakdownColors[6],
        fallbackWeight: 7,
      },
      {
        key: "forwarding_address",
        label: "Forwarding",
        color: categoryBreakdownColors[7],
        fallbackWeight: 8,
      },
      {
        key: "unexpected_error",
        label: "Unexpected error",
        color: categoryBreakdownColors[8],
        fallbackWeight: 5,
      },
      {
        key: "greylisted",
        label: "Greylisted",
        color: categoryBreakdownColors[9],
        fallbackWeight: 6,
      },
      {
        key: "mail_server_temp_error",
        label: "Mail server temporary error",
        color: categoryBreakdownColors[10],
        fallbackWeight: 5,
      },
    ],
  },
  restricted: {
    metric: "suppress_reason",
    segments: [
      {
        key: "spam_trap",
        label: "Spam trap",
        color: categoryBreakdownColors[0],
        fallbackWeight: 3,
      },
      {
        key: "abuse",
        label: "Abuse-tied email",
        color: categoryBreakdownColors[1],
        fallbackWeight: 2,
      },
      {
        key: "globally_suppressed",
        label: "Globally suppressed",
        color: categoryBreakdownColors[2],
        fallbackWeight: 5,
      },
    ],
  },
}

export const DASHBOARD_CATEGORY_BREAKDOWN_METRICS = DASHBOARD_CATEGORY_KEYS.map(
  (category) => DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].metric
)

export function createEmptyDashboardCategoryBreakdownCategories() {
  return DASHBOARD_CATEGORY_KEYS.reduce<
    Record<DashboardCategory, Record<string, number>>
  >((categories, category) => {
    categories[category] = {}
    return categories
  }, {} as Record<DashboardCategory, Record<string, number>>)
}

export function getDashboardCategoryForBreakdownMetric(metric: string) {
  return DASHBOARD_CATEGORY_KEYS.find(
    (category) => DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].metric === metric
  )
}

export function buildDerivedDashboardCategoryBreakdownRows(
  historical: DashboardHistoricalPoint[]
): DashboardCategoryBreakdownPoint[] {
  return historical.map((point) => {
    const categories = createEmptyDashboardCategoryBreakdownCategories()

    DASHBOARD_CATEGORY_KEYS.forEach((category) => {
      const segments = DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].segments
      const total = Number(point[category] || 0)
      const totalWeight = segments.reduce(
        (sum, segment) => sum + segment.fallbackWeight,
        0
      )
      let allocated = 0

      segments.forEach((segment, index) => {
        const isLastSegment = index === segments.length - 1
        const value = isLastSegment
          ? Math.max(total - allocated, 0)
          : Math.round((total * segment.fallbackWeight) / totalWeight)

        allocated += value
        categories[category][segment.key] = value
      })
    })

    return {
      month: point.month,
      categories,
    }
  })
}
