export const DASHBOARD_CATEGORY_KEYS = [
  "valid",
  "invalid",
  "risky",
  "restricted",
] as const

export type DashboardCategory = (typeof DASHBOARD_CATEGORY_KEYS)[number]

export type DashboardCounts = {
  totalSuppressed: number
  monthTotalTagged: number
  monthSuppressed: number
  chart: Record<DashboardCategory, number>
}

const milestoneTargets = [
  ["10", 10],
  ["100", 100],
  ["500", 500],
  ["1k", 1_000],
  ["10k", 10_000],
  ["100k", 100_000],
  ["500k", 500_000],
  ["1m", 1_000_000],
] as const

export type DashboardHistoricalPoint = {
  month: string
  valid: number
  invalid: number
  risky: number
  restricted: number
}

export function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)

  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    start: start.toISOString(),
    end: now.toISOString(),
  }
}

export function buildMilestoneGoals(totalSuppressed: number) {
  return milestoneTargets.reduce<Record<string, boolean>>(
    (goals, [key, target]) => {
      goals[key] = totalSuppressed >= target
      return goals
    },
    {}
  )
}

export function getNextMilestoneRemaining(totalSuppressed: number) {
  const nextTarget = milestoneTargets.find(([, target]) => totalSuppressed < target)

  if (!nextTarget) {
    return 0
  }

  return nextTarget[1] - totalSuppressed
}

export function calculateSuppressedPercentage(suppressed: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return Number(((suppressed / total) * 100).toFixed(2))
}

export function buildDashboardReport(
  counts: DashboardCounts & {
    historical?: DashboardHistoricalPoint[]
    typoFixes?: number
  },
  now = new Date()
) {
  const monthRange = getCurrentMonthRange(now)
  const suppressedPercentage = calculateSuppressedPercentage(
    counts.monthSuppressed,
    counts.monthTotalTagged
  )
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(now)

  return {
    monthLabel,
    totalSuppressed: counts.totalSuppressed,
    nextMilestoneRemaining: getNextMilestoneRemaining(counts.totalSuppressed),
    kpis: [
      {
        label: "Emails Checked",
        value: counts.monthTotalTagged.toLocaleString(),
      },
      {
        label: "Suppressed Percentage",
        value: `${suppressedPercentage}%`,
      },
      {
        label: "Emails Suppressed",
        value: counts.monthSuppressed.toLocaleString(),
      },
      {
        label: "Typo Fixes",
        value: (counts.typoFixes || 0).toLocaleString(),
      },
    ],
    distribution: DASHBOARD_CATEGORY_KEYS.map((key) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value: counts.chart[key],
    })),
    historical: counts.historical || [],
    milestones: {
      total_suppressed: counts.totalSuppressed,
      goals: buildMilestoneGoals(counts.totalSuppressed),
    },
    performance: {
      month: monthRange.month,
      year: monthRange.year,
      emails_checked: counts.monthTotalTagged,
      emails_suppressed: counts.monthSuppressed,
      suppressed_percentage: suppressedPercentage,
      supprssed_percentage: suppressedPercentage,
      chart: counts.chart,
    },
  }
}
