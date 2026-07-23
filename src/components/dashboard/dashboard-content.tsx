"use client"

import { useEffect, useRef, useState } from "react"
import {
  Check,
  Loader2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  Sector,
  XAxis,
  YAxis,
} from "recharts"
import type { PieSectorShapeProps } from "recharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { dashboardDemoData } from "@/lib/demo-data"
import {
  DASHBOARD_CATEGORY_BREAKDOWN_CONFIG,
  buildDerivedDashboardCategoryBreakdownRows,
} from "@/lib/dashboard/breakdown"
import {
  DASHBOARD_CATEGORY_KEYS,
  getLastTwelveMonthBuckets,
  type DashboardCategory,
  type DashboardCategoryBreakdownPoint,
  type DashboardHistoricalPoint,
} from "@/lib/dashboard/report"

type DashboardViewData = typeof dashboardDemoData & {
  categoryBreakdown?: DashboardCategoryBreakdownPoint[]
}

const milestoneLabels = ["10", "100", "500", "1k", "10k", "100k", "500k", "1m"]
const milestoneValues = [10, 100, 500, 1000, 10000, 100000, 500000, 1000000]
const numberFormatter = new Intl.NumberFormat("en-US")

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function useAnimatedNumber(value: number, duration = 650) {
  const [displayValue, setDisplayValue] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    const animationDuration = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
      ? 0
      : duration

    const startValue = displayRef.current
    const valueDelta = value - startValue
    const startTime = performance.now()
    let animationFrame = 0

    if (valueDelta === 0) {
      return
    }

    const tick = (currentTime: number) => {
      const progress = animationDuration
        ? Math.min((currentTime - startTime) / animationDuration, 1)
        : 1
      const nextValue = startValue + valueDelta * easeOutCubic(progress)

      displayRef.current = nextValue
      setDisplayValue(nextValue)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick)
        return
      }

      displayRef.current = value
      setDisplayValue(value)
    }

    animationFrame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [duration, value])

  return displayValue
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value)
}

function parseDisplayNumber(displayValue: string) {
  const match = displayValue.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/)

  if (!match) {
    return {
      decimals: 0,
      isNumeric: false,
      prefix: "",
      suffix: "",
      value: 0,
    }
  }

  const [, prefix, numberValue, suffix] = match
  const decimals = numberValue.includes(".")
    ? numberValue.split(".")[1].length
    : 0

  return {
    decimals,
    isNumeric: true,
    prefix,
    suffix,
    value: Number(numberValue.replace(/,/g, "")),
  }
}

function AnimatedNumber({
  decimals = 0,
  duration,
  prefix = "",
  suffix = "",
  value,
}: {
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
  value: number
}) {
  const displayValue = useAnimatedNumber(value, duration)

  return (
    <span>
      {prefix}
      {formatNumber(displayValue, decimals)}
      {suffix}
    </span>
  )
}

function AnimatedDisplayNumber({ value }: { value: string }) {
  const parsedValue = parseDisplayNumber(value)
  const displayValue = useAnimatedNumber(parsedValue.value)

  if (!parsedValue.isNumeric) {
    return <span>{value}</span>
  }

  return (
    <span>
      {parsedValue.prefix}
      {formatNumber(displayValue, parsedValue.decimals)}
      {parsedValue.suffix}
    </span>
  )
}

function getMilestoneProgressPercent(value: number) {
  if (value < milestoneValues[0]) {
    return 0
  }

  const lastIndex = milestoneValues.length - 1

  if (value >= milestoneValues[lastIndex]) {
    return 100
  }

  const nextIndex = milestoneValues.findIndex((milestone) => value < milestone)
  const previousIndex = Math.max(nextIndex - 1, 0)
  const previousValue = milestoneValues[previousIndex]
  const nextValue = milestoneValues[nextIndex]
  const segmentProgress = (value - previousValue) / (nextValue - previousValue)

  return ((previousIndex + segmentProgress) / lastIndex) * 100
}

const emptyKpis = [
  {
    label: "Emails Checked",
    value: "0",
    icon: ShieldCheck,
  },
  {
    label: "Suppressed Percentage",
    value: "0%",
    icon: Sparkles,
  },
  {
    label: "Typos Fixed",
    value: "0",
    icon: WandSparkles,
  },
]

const emptyDashboardData: DashboardViewData = {
  monthLabel: new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date()),
  totalSuppressed: 0,
  nextMilestoneRemaining: 10,
  kpis: emptyKpis.map(({ label, value }) => ({ label, value })),
  distribution: [],
  historical: [],
}

const chartColors = [
  "#346ce6",
  "#ef4444",
  "#f59e0b",
  "#64748b",
  "#3f5d9f",
]

const statusChartConfig: ChartConfig = {
  valid: {
    label: "Valid",
    color: chartColors[0],
  },
  invalid: {
    label: "Invalid",
    color: chartColors[1],
  },
  risky: {
    label: "Risky",
    color: chartColors[2],
  },
  restricted: {
    label: "Restricted",
    color: chartColors[3],
  },
  "no-data": {
    label: "No Data",
    color: "var(--foreground)",
  },
}

const removedChartConfig: ChartConfig = {
  removed: {
    label: "Removed",
    color: chartColors[0],
  },
  remaining: {
    label: "Remaining",
    color: "var(--muted)",
  },
}

type EmailStatusChartItem = {
  status: string
  label: string
  emails: number
  fill: string
}

function toStatusKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function getEmailStatusColor(status: string, index: number) {
  return (
    statusChartConfig[status]?.color ||
    chartColors[index % chartColors.length]
  )
}

function getKpiDisplayLabel(label: string) {
  const normalized = label.toLowerCase()

  if (normalized === "suppressed percentage") {
    return "Removal Rate"
  }

  if (normalized === "emails suppressed") {
    return "Emails Removed"
  }

  if (normalized === "typo fixes") {
    return "Typos Fixed"
  }

  return label
}

function isRemovedKpiLabel(label: string) {
  const normalized = label.toLowerCase()

  return normalized === "emails removed" || normalized === "emails suppressed"
}

function getKpiIcon(label: string) {
  const normalized = label.toLowerCase()

  if (normalized === "emails checked") {
    return ShieldCheck
  }

  if (normalized === "suppressed percentage") {
    return Sparkles
  }

  if (normalized === "typo fixes" || normalized === "typos fixed") {
    return WandSparkles
  }

  return ShieldCheck
}

function renderEmailStatusSector(
  props: PieSectorShapeProps,
  activeStatus: string
) {
  const outerRadius = typeof props.outerRadius === "number" ? props.outerRadius : 90
  const payload = props.payload as EmailStatusChartItem | undefined

  return (
    <Sector
      {...props}
      outerRadius={
        payload?.status === activeStatus ? outerRadius + 8 : outerRadius
      }
    />
  )
}

function getLastTwelveEmptyHistoricalPoints() {
  return getLastTwelveMonthBuckets()
}

function hasHistoricalValues(historical: DashboardHistoricalPoint[]) {
  return historical.some(
    (point) => point.valid || point.invalid || point.risky || point.restricted
  )
}

function hasCategoryBreakdownValues(rows: DashboardCategoryBreakdownPoint[]) {
  return rows.some((row) =>
    DASHBOARD_CATEGORY_KEYS.some((category) =>
      Object.values(row.categories[category] || {}).some((value) => value > 0)
    )
  )
}

function normalizeLastTwelveHistoricalPoints(
  historical: DashboardHistoricalPoint[]
) {
  const buckets = getLastTwelveEmptyHistoricalPoints()
  const bucketsByMonthStart = new Map(
    buckets.map((bucket) => [bucket.monthStart, bucket])
  )
  const usedMonthStarts = new Set<string>()

  for (const point of historical) {
    let bucket = point.monthStart
      ? bucketsByMonthStart.get(point.monthStart)
      : undefined

    if (!bucket) {
      for (let index = buckets.length - 1; index >= 0; index -= 1) {
        const candidate = buckets[index]
        if (
          candidate.month === point.month &&
          candidate.monthStart &&
          !usedMonthStarts.has(candidate.monthStart)
        ) {
          bucket = candidate
          break
        }
      }
    }

    if (!bucket) {
      continue
    }

    if (bucket.monthStart) {
      usedMonthStarts.add(bucket.monthStart)
    }

    bucket.valid = Number(point.valid || 0)
    bucket.invalid = Number(point.invalid || 0)
    bucket.risky = Number(point.risky || 0)
    bucket.restricted = Number(point.restricted || 0)
  }

  return buckets
}

function getKpiNumber(
  kpis: DashboardViewData["kpis"],
  labels: string[]
) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())
  const item = kpis.find((kpi) =>
    normalizedLabels.includes(kpi.label.toLowerCase())
  )

  if (!item) {
    return 0
  }

  return parseDisplayNumber(item.value).value
}

type CategoryBreakdownChartPoint = {
  month: string
  [key: string]: string | number
}

function buildCategoryBreakdownRows(
  breakdownRows: DashboardCategoryBreakdownPoint[],
  category: DashboardCategory
) {
  const segments = DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].segments

  return breakdownRows.map((row) => {
    const point: CategoryBreakdownChartPoint = { month: row.month }

    segments.forEach((segment) => {
      point[segment.key] = Number(row.categories[category]?.[segment.key] || 0)
    })

    return point
  })
}

function buildCategoryBreakdownChartConfig(category: DashboardCategory) {
  return DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].segments.reduce<ChartConfig>(
    (config, segment) => {
      config[segment.key] = {
        label: segment.label,
        color: segment.color,
      }

      return config
    },
    {}
  )
}

export function DashboardContent() {
  const [showDummyData, setShowDummyData] = useState(false)
  const [activeStatus, setActiveStatus] = useState("valid")
  const [activeBreakdownCategory, setActiveBreakdownCategory] =
    useState<DashboardCategory>("valid")
  const [liveData, setLiveData] = useState<DashboardViewData | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState("")
  const activeDashboardData: DashboardViewData = showDummyData
    ? dashboardDemoData
    : liveData || emptyDashboardData
  const kpis = activeDashboardData.kpis.length
    ? activeDashboardData.kpis
    : emptyKpis.map(({ label, value }) => ({ label, value }))
  const visibleKpis = kpis.filter((item) => !isRemovedKpiLabel(item.label))
  const distribution = activeDashboardData.distribution.length
    ? activeDashboardData.distribution
    : DASHBOARD_CATEGORY_KEYS.map((key) => ({
        label: String(statusChartConfig[key].label),
        value: 0,
      }))
  const distributionTotal = distribution.reduce(
    (total, item) => total + item.value,
    0
  )
  const emailStatusChartData = distributionTotal
    ? distribution.map((item, index) => {
        const status = toStatusKey(item.label)

        return {
          status,
          label: item.label,
          emails: item.value,
          fill: getEmailStatusColor(status, index),
        }
      })
    : [
        {
          status: "no-data",
          label: "No Data",
          emails: 1,
          fill: "var(--muted)",
        },
      ]
  const activeChartItem =
    emailStatusChartData.find((item) => item.status === activeStatus) ??
    emailStatusChartData[0]
  const activeStatusKey = activeChartItem?.status || ""
  const activeStatusPercent =
    activeChartItem && distributionTotal
      ? Math.round((activeChartItem.emails / distributionTotal) * 100)
      : 0
  const animatedActiveStatusPercent = useAnimatedNumber(activeStatusPercent, 350)
  const historical = normalizeLastTwelveHistoricalPoints(
    activeDashboardData.historical.length
      ? activeDashboardData.historical
      : getLastTwelveEmptyHistoricalPoints()
  )
  const visibleHistorical = historical.map((item) => ({
    ...item,
    total: item.valid + item.invalid + item.risky + item.restricted,
  }))
  const reportCategoryBreakdown = activeDashboardData.categoryBreakdown || []
  const categoryBreakdownSource =
    reportCategoryBreakdown.length &&
    (hasCategoryBreakdownValues(reportCategoryBreakdown) ||
      !hasHistoricalValues(visibleHistorical))
      ? reportCategoryBreakdown
      : buildDerivedDashboardCategoryBreakdownRows(visibleHistorical)
  const activeBreakdownSegments =
    DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[activeBreakdownCategory].segments
  const categoryBreakdownData = buildCategoryBreakdownRows(
    categoryBreakdownSource,
    activeBreakdownCategory
  )
  const categoryBreakdownChartConfig = buildCategoryBreakdownChartConfig(
    activeBreakdownCategory
  )
  const emailsChecked = getKpiNumber(kpis, ["Emails Checked"])
  const emailsRemoved = getKpiNumber(kpis, [
    "Emails Removed",
    "Emails Suppressed",
  ])
  const removedChartTotal = Math.max(emailsChecked, emailsRemoved)
  const removedPercent = removedChartTotal
    ? Math.min((emailsRemoved / removedChartTotal) * 100, 100)
    : 0
  const animatedRemovedPercent = useAnimatedNumber(removedPercent, 350)
  const removedChartData = [
    {
      removed: emailsRemoved,
      remaining: Math.max(
        removedChartTotal - emailsRemoved,
        removedChartTotal ? 0 : 1
      ),
    },
  ]
  const totalSuppressed = activeDashboardData.totalSuppressed
  const milestoneProgressPercent = getMilestoneProgressPercent(totalSuppressed)

  useEffect(() => {
    let cancelled = false

    async function loadLiveDashboard() {
      setLiveLoading(true)
      setLiveError("")

      try {
        const response = await fetch("/api/user/dashboard", {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error("Unable to load dashboard data.")
        }

        const data = (await response.json()) as DashboardViewData
        if (!cancelled) {
          setLiveData(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLiveError(
            error instanceof Error
              ? error.message
              : "Unable to load dashboard data."
          )
        }
      } finally {
        if (!cancelled) {
          setLiveLoading(false)
        }
      }
    }

    loadLiveDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grid gap-8">
      <Card className="bg-muted">
        <CardContent className="grid gap-4 sm:flex sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <p className="text-base font-medium">
              Welcome. Take a look at what your dashboard will look like soon!
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {!showDummyData && liveLoading && (
                <Loader2 className="size-4 animate-spin" />
              )}
              <span>
                {showDummyData
                  ? "Toggle off to see your workspace data."
                  : liveLoading
                    ? "Loading workspace data."
                    : liveError || "Showing your workspace data."}
              </span>
            </p>
          </div>
          <Switch
            checked={showDummyData}
            aria-label="Toggle dummy data"
            onCheckedChange={setShowDummyData}
          />
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle>Cleanup Milestones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pb-4">
          <div className="text-sm text-muted-foreground">
            <span>
              Total Suppressed Emails:{" "}
              <AnimatedNumber value={totalSuppressed} />
            </span>
          </div>
          <div className="grid gap-2">
            <div className="relative grid h-8 grid-cols-8 items-center gap-0">
              <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-border" />
              <div
                className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${milestoneProgressPercent}%` }}
              />
              {milestoneLabels.map((label, index) => {
                const isReached = totalSuppressed >= milestoneValues[index]

                return (
                  <div
                    key={label}
                    className="relative z-10 flex flex-col items-center gap-1"
                  >
                    <span
                      className={
                        isReached
                          ? "flex size-5 items-center justify-center rounded-full border border-primary bg-primary transition-colors"
                          : "flex size-5 items-center justify-center rounded-full border border-border bg-background transition-colors"
                      }
                    >
                      {isReached ? (
                        <Check className="size-3 text-white" strokeWidth={3} />
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mx-3 grid grid-cols-8 text-center text-xs text-muted-foreground">
              {milestoneLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          {activeDashboardData.monthLabel}
        </h1>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleKpis.map((item) => {
            const Icon = getKpiIcon(item.label)

            return (
              <Card key={item.label}>
                <CardContent className="grid min-h-36 gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-6 text-primary" />
                  </div>
                  <div className="mt-auto grid gap-1">
                    <p className="text-sm text-muted-foreground">
                      {getKpiDisplayLabel(item.label)}
                    </p>
                    <p className="text-3xl font-semibold tabular-nums sm:text-4xl">
                      <AnimatedDisplayNumber value={item.value} />
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="flex min-h-80 flex-col justify-center gap-4">
              <ChartContainer
                config={statusChartConfig}
                className="mx-auto aspect-square h-[320px] w-full max-w-[360px]"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel nameKey="label" />}
                  />
                  <Pie
                    data={emailStatusChartData}
                    dataKey="emails"
                    nameKey="label"
                    innerRadius={74}
                    outerRadius={126}
                    strokeWidth={5}
                    shape={(props: PieSectorShapeProps) =>
                      renderEmailStatusSector(props, activeStatusKey)
                    }
                    onMouseEnter={(item) => {
                      const payload =
                        item.payload as EmailStatusChartItem | undefined

                      if (payload?.status) {
                        setActiveStatus(payload.status)
                      }
                    }}
                    onClick={(item) => {
                      const payload =
                        item.payload as EmailStatusChartItem | undefined

                      if (payload?.status) {
                        setActiveStatus(payload.status)
                      }
                    }}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (
                          !viewBox ||
                          !("cx" in viewBox) ||
                          !("cy" in viewBox) ||
                          typeof viewBox.cx !== "number" ||
                          typeof viewBox.cy !== "number"
                        ) {
                          return null
                        }

                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy - 8}
                              className="fill-foreground text-2xl font-semibold"
                            >
                              {formatNumber(animatedActiveStatusPercent)}%
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy + 16}
                              className="fill-muted-foreground text-xs"
                            >
                              {activeChartItem?.label}
                            </tspan>
                          </text>
                        )
                      }}
                    />
                  </Pie>
                  <ChartLegend
                    content={
                      <ChartLegendContent
                        className="flex-wrap gap-x-5 gap-y-3"
                        nameKey="status"
                      />
                    }
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex min-h-80 flex-col justify-center gap-4">
              <ChartContainer
                config={removedChartConfig}
                className="mx-auto aspect-square h-[240px] w-full max-w-[280px]"
              >
                <RadialBarChart
                  data={removedChartData}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius="72%"
                  outerRadius="96%"
                >
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <PolarRadiusAxis
                    tick={false}
                    tickLine={false}
                    axisLine={false}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (
                          !viewBox ||
                          !("cx" in viewBox) ||
                          !("cy" in viewBox) ||
                          typeof viewBox.cx !== "number" ||
                          typeof viewBox.cy !== "number"
                        ) {
                          return null
                        }

                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-2xl font-semibold"
                            >
                              {formatNumber(animatedRemovedPercent)}%
                            </tspan>
                          </text>
                        )
                      }}
                    />
                  </PolarRadiusAxis>
                  <RadialBar
                    dataKey="removed"
                    stackId="a"
                    cornerRadius={8}
                    fill={removedChartConfig.removed.color}
                    className="stroke-transparent stroke-2"
                  />
                  <RadialBar
                    dataKey="remaining"
                    stackId="a"
                    cornerRadius={8}
                    fill={removedChartConfig.remaining.color}
                    className="stroke-transparent stroke-2"
                  />
                </RadialBarChart>
              </ChartContainer>
              <p className="text-center text-sm text-muted-foreground">
                {formatNumber(animatedRemovedPercent)}% of checked emails
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6">
        <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Last 12 Months
        </h2>
        <Card className="@container/card">
          <CardContent className="grid min-h-72 gap-5 pt-3 pb-5 sm:px-6">
            <ChartContainer
              config={statusChartConfig}
              className="aspect-auto h-[340px] w-full"
            >
              <BarChart
                data={visibleHistorical}
                margin={{
                  top: 10,
                  right: 20,
                  left: 8,
                  bottom: 0,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => numberFormatter.format(value)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="valid"
                  name="valid"
                  fill={statusChartConfig.valid.color}
                  stackId="status"
                />
                <Bar
                  dataKey="risky"
                  name="risky"
                  fill={statusChartConfig.risky.color}
                  stackId="status"
                />
                <Bar
                  dataKey="invalid"
                  name="invalid"
                  fill={statusChartConfig.invalid.color}
                  stackId="status"
                />
                <Bar
                  dataKey="restricted"
                  name="restricted"
                  fill={statusChartConfig.restricted.color}
                  radius={[4, 4, 0, 0]}
                  stackId="status"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Category Breakdown
        </h2>
        <Tabs
          value={activeBreakdownCategory}
          onValueChange={(value) =>
            setActiveBreakdownCategory(value as DashboardCategory)
          }
        >
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            {DASHBOARD_CATEGORY_KEYS.map((status) => (
              <TabsTrigger key={status} value={status}>
                {statusChartConfig[status].label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Card>
            <CardContent className="grid min-h-72 gap-5 pt-5 pb-6 sm:px-6">
              <ChartContainer
                config={categoryBreakdownChartConfig}
                className="aspect-auto h-[360px] w-full"
              >
                <BarChart
                  accessibilityLayer
                  data={categoryBreakdownData}
                  margin={{
                    top: 10,
                    right: 16,
                    left: 4,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                  />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => numberFormatter.format(value)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  {activeBreakdownSegments.map((segment, index) => (
                    <Bar
                      key={segment.key}
                      dataKey={segment.key}
                      name={segment.key}
                      stackId={activeBreakdownCategory}
                      fill={segment.color}
                      maxBarSize={64}
                      radius={
                        index === 0
                          ? [0, 0, 4, 4]
                          : index === activeBreakdownSegments.length - 1
                            ? [4, 4, 0, 0]
                            : [0, 0, 0, 0]
                      }
                    />
                  ))}
                  <ChartLegend
                    content={
                      <ChartLegendContent className="flex-wrap gap-x-5 gap-y-3" />
                    }
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </Tabs>
      </section>
    </div>
  )
}
