"use client"

import { useEffect, useRef, useState } from "react"
import {
  BadgeCheck,
  Check,
  Loader2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
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
  type DashboardCategoryBreakdownSegment,
} from "@/lib/dashboard/breakdown"
import {
  DASHBOARD_CATEGORY_KEYS,
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
    label: "Emails Suppressed",
    value: "0",
    icon: BadgeCheck,
  },
  {
    label: "Typo Fixes",
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

const emailStatusFallbackColors = [
  "#346ce6",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#64748b",
]

const emailStatusChartConfig: ChartConfig = {
  valid: {
    label: "Valid",
    color: "#346ce6",
  },
  invalid: {
    label: "Invalid",
    color: "#ef4444",
  },
  risky: {
    label: "Risky",
    color: "#f59e0b",
  },
  restricted: {
    label: "Restricted",
    color: "#64748b",
  },
}

const historicalChartConfig: ChartConfig = {
  valid: {
    label: "Valid",
    color: "#346ce6",
  },
  invalid: {
    label: "Invalid",
    color: "#ef4444",
  },
  risky: {
    label: "Risky",
    color: "#f59e0b",
  },
  restricted: {
    label: "Restricted",
    color: "#64748b",
  },
}

type CategoryBreakdownPoint = {
  month: string
  [key: string]: string | number
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
    emailStatusChartConfig[status]?.color ??
    emailStatusFallbackColors[index % emailStatusFallbackColors.length]
  )
}

function getLastTwelveEmptyHistoricalPoints() {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" })
  const now = new Date()

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)

    return {
      month: formatter.format(date),
      valid: 0,
      invalid: 0,
      risky: 0,
      restricted: 0,
    }
  })
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

function buildCategoryBreakdownRows(
  breakdownRows: DashboardCategoryBreakdownPoint[],
  category: DashboardCategory
) {
  const segments = DASHBOARD_CATEGORY_BREAKDOWN_CONFIG[category].segments

  return breakdownRows.map((point) => {
    const row: CategoryBreakdownPoint = { month: point.month }

    segments.forEach((segment) => {
      row[segment.key] = Number(point.categories[category]?.[segment.key] || 0)
    })

    return row
  })
}

function buildCategoryBreakdownChartConfig(
  segments: DashboardCategoryBreakdownSegment[]
) {
  return segments.reduce<ChartConfig>((config, segment) => {
    config[segment.key] = {
      label: segment.label,
      color: segment.color,
    }

    return config
  }, {})
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
  const kpis = activeDashboardData.kpis.map((item, index) => ({
    ...item,
    icon: emptyKpis[index]?.icon || ShieldCheck,
  }))
  const distribution = activeDashboardData.distribution.length
    ? activeDashboardData.distribution
    : DASHBOARD_CATEGORY_KEYS.map((key) => ({
        label: String(historicalChartConfig[key].label),
        value: 0,
      }))
  const historical = activeDashboardData.historical.length
    ? activeDashboardData.historical
    : getLastTwelveEmptyHistoricalPoints()
  const historicalChartData = historical.map((item) => ({
    ...item,
    total: item.valid + item.invalid + item.risky + item.restricted,
  }))
  const visibleHistorical = historicalChartData.slice(-12)
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
    activeBreakdownSegments
  )
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
          fill: "var(--foreground)",
        },
      ]
  const activeChartItem =
    emailStatusChartData.find((item) => item.status === activeStatus) ??
    emailStatusChartData[0]
  const activeStatusKey = activeChartItem?.status ?? ""
  const activeStatusPercent =
    activeChartItem && distributionTotal
      ? Math.round((activeChartItem.emails / distributionTotal) * 100)
      : 0
  const animatedActiveStatusPercent = useAnimatedNumber(activeStatusPercent, 350)
  const totalSuppressed = activeDashboardData.totalSuppressed
  const nextMilestoneRemaining = activeDashboardData.nextMilestoneRemaining
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

      <Card className="bg-secondary/70">
        <CardHeader>
          <CardTitle>Hit Your Hygiene Milestones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2 text-sm sm:flex sm:items-center sm:justify-between">
            <span>
              Total Suppressed Emails:{" "}
              <AnimatedNumber value={totalSuppressed} />
            </span>
            <span>
              Wipe out <AnimatedNumber value={nextMilestoneRemaining} />{" "}
              more to level up!
            </span>
          </div>
          <div className="grid gap-2">
            <div className="relative grid h-8 grid-cols-8 items-center gap-0">
              <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-[#d1d5db]" />
              <div
                className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-[#0043CE] transition-[width] duration-700 ease-out"
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
                          ? "flex size-5 items-center justify-center rounded-full border border-[#0043CE] bg-[#0043CE] transition-colors"
                          : "flex size-5 items-center justify-center rounded-full border border-border bg-white transition-colors"
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
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.85fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {kpis.map((item) => {
              const Icon = item.icon

              return (
                <Card key={item.label}>
                  <CardContent className="grid min-h-40 gap-4">
                    <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-7 text-[#346ce6]" />
                    </div>
                    <div className="mt-auto grid gap-1">
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="text-3xl font-semibold sm:text-4xl">
                        <AnimatedDisplayNumber value={item.value} />
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardContent className="flex min-h-full flex-col justify-center gap-4">
              <ChartContainer
                config={emailStatusChartConfig}
                className="mx-auto aspect-square h-[340px] w-full max-w-[380px]"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel nameKey="status" />}
                  />
                  <Pie
                    data={emailStatusChartData}
                    dataKey="emails"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={125}
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
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6">
        <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Historical Performance
        </h2>
        <Card className="@container/card">
          <CardContent className="grid min-h-72 gap-5 pt-3 pb-5 sm:px-6">
            <ChartContainer
              config={historicalChartConfig}
              className="aspect-auto h-[320px] w-full"
            >
              <AreaChart
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
                <defs>
                  <linearGradient id="fillValid" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={historicalChartConfig.valid.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={historicalChartConfig.valid.color}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillInvalid" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={historicalChartConfig.invalid.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={historicalChartConfig.invalid.color}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillRisky" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={historicalChartConfig.risky.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={historicalChartConfig.risky.color}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient
                    id="fillRestricted"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={historicalChartConfig.restricted.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={historicalChartConfig.restricted.color}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="valid"
                  name="valid"
                  type="natural"
                  fill="url(#fillValid)"
                  fillOpacity={0.4}
                  stroke={historicalChartConfig.valid.color}
                  stackId="a"
                />
                <Area
                  dataKey="risky"
                  name="risky"
                  type="natural"
                  fill="url(#fillRisky)"
                  fillOpacity={0.4}
                  stroke={historicalChartConfig.risky.color}
                  stackId="a"
                />
                <Area
                  dataKey="invalid"
                  name="invalid"
                  type="natural"
                  fill="url(#fillInvalid)"
                  fillOpacity={0.4}
                  stroke={historicalChartConfig.invalid.color}
                  stackId="a"
                />
                <Area
                  dataKey="restricted"
                  name="restricted"
                  type="natural"
                  fill="url(#fillRestricted)"
                  fillOpacity={0.4}
                  stroke={historicalChartConfig.restricted.color}
                  stackId="a"
                />
              </AreaChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {DASHBOARD_CATEGORY_KEYS.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: historicalChartConfig[status].color,
                    }}
                  />
                  <span>{historicalChartConfig[status].label}</span>
                </div>
              ))}
            </div>
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
                {historicalChartConfig[status].label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Card>
            <CardContent className="grid min-h-72 gap-5 pt-5 pb-6 sm:px-6">
              <ChartContainer
                config={categoryBreakdownChartConfig}
                className="aspect-auto h-[320px] w-full sm:h-[380px]"
              >
                <BarChart
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
                </BarChart>
              </ChartContainer>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
                {activeBreakdownSegments.map((segment) => (
                  <div key={segment.key} className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{
                        backgroundColor: segment.color,
                      }}
                    />
                    <span>{segment.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Tabs>
      </section>
    </div>
  )
}
