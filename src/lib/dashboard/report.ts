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

export function calculateSuppressedPercentage(suppressed: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return Number(((suppressed / total) * 100).toFixed(2))
}

export function buildDashboardReport(counts: DashboardCounts, now = new Date()) {
  const monthRange = getCurrentMonthRange(now)

  return {
    milestones: {
      total_suppressed: counts.totalSuppressed,
      goals: buildMilestoneGoals(counts.totalSuppressed),
    },
    performance: {
      month: monthRange.month,
      year: monthRange.year,
      emails_checked: counts.monthTotalTagged,
      emails_suppressed: counts.monthSuppressed,
      suppressed_percentage: calculateSuppressedPercentage(
        counts.monthSuppressed,
        counts.monthTotalTagged
      ),
      supprssed_percentage: calculateSuppressedPercentage(
        counts.monthSuppressed,
        counts.monthTotalTagged
      ),
      chart: counts.chart,
    },
  }
}
