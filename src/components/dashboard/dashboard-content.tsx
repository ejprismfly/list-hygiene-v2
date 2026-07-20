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

type DashboardViewData = typeof dashboardDemoData

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

const categoryBreakdownKeys = [
  "valid",
  "invalid",
  "risky",
  "restricted",
] as const

type CategoryBreakdownKey = (typeof categoryBreakdownKeys)[number]

type CategoryBreakdownSegment = {
  key: string
  label: string
  color: string
  weight: number
}

type CategoryBreakdownPoint = {
  month: string
  [key: string]: string | number
}

const categoryBreakdownSeries: Record<
  CategoryBreakdownKey,
  CategoryBreakdownSegment[]
> = {
  valid: [
    { key: "validAccepted", label: "Valid", color: "#3f5d9f", weight: 9 },
    { key: "validSecondary", label: "Secondary", color: "#7895cc", weight: 1 },
  ],
  invalid: [
    { key: "invalidNoMailAccepted", label: "No mail accepted", color: "#3f5d9f", weight: 13 },
    { key: "invalidFormat", label: "Invalid email format", color: "#7895cc", weight: 8 },
    { key: "invalidNoMailbox", label: "No mailbox", color: "#6d54a8", weight: 12 },
    { key: "invalidNoDns", label: "No DNS", color: "#a65397", weight: 9 },
    { key: "invalidFullMailbox", label: "Full mailbox", color: "#f25292", weight: 6 },
    { key: "invalidUnreachableDomain", label: "Unreachable domain", color: "#dc3f4e", weight: 11 },
    { key: "invalidAntiSpam", label: "Anti-spam system", color: "#fb7133", weight: 11 },
    { key: "invalidSmtpFailure", label: "SMTP failure", color: "#ff9f0a", weight: 10 },
    { key: "invalidConnectionDropped", label: "Connection dropped", color: "#42cdb1", weight: 6 },
    { key: "invalidNoResponse", label: "Mail server did not respond", color: "#0b9f95", weight: 8 },
    { key: "invalidTimeout", label: "Connection timeout", color: "#bfdc3e", weight: 6 },
  ],
  risky: [
    { key: "riskyTypo", label: "Typo", color: "#3f5d9f", weight: 18 },
    { key: "riskyCatchAll", label: "Catch-all", color: "#7895cc", weight: 16 },
    { key: "riskySpamTrap", label: "Possible spam trap", color: "#6d54a8", weight: 11 },
    { key: "riskyRoleBased", label: "Role-based", color: "#a65397", weight: 11 },
    { key: "riskyTemporary", label: "Temporary", color: "#f25292", weight: 8 },
    { key: "riskyBots", label: "High risk (bots)", color: "#dc3f4e", weight: 10 },
    { key: "riskyRoleCatchAll", label: "Role-based catch-all", color: "#fb7133", weight: 7 },
    { key: "riskyForwarding", label: "Forwarding", color: "#ff9f0a", weight: 8 },
    { key: "riskyUnexpected", label: "Unexpected error", color: "#42cdb1", weight: 5 },
    { key: "riskyGreylisted", label: "Greylisted", color: "#0b9f95", weight: 6 },
    {
      key: "riskyMailServerTemporary",
      label: "Mail server temporary error",
      color: "#bfdc3e",
      weight: 5,
    },
  ],
  restricted: [
    { key: "restrictedSpamTrap", label: "Spam trap", color: "#3f5d9f", weight: 3 },
    {
      key: "restrictedAbuseTied",
      label: "Abuse-tied email",
      color: "#7895cc",
      weight: 2,
    },
    {
      key: "restrictedSuppressed",
      label: "Globally suppressed",
      color: "#6d54a8",
      weight: 5,
    },
  ],
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

function buildCategoryBreakdownRows(
  historical: DashboardViewData["historical"],
  category: CategoryBreakdownKey
) {
  const segments = categoryBreakdownSeries[category]
  const totalWeight = segments.reduce((total, segment) => total + segment.weight, 0)

  return historical.map((point) => {
    const total = Number(point[category] || 0)
    let allocated = 0
    const row: CategoryBreakdownPoint = { month: point.month }

    segments.forEach((segment, index) => {
      const isLastSegment = index === segments.length - 1
      const value = isLastSegment
        ? Math.max(total - allocated, 0)
        : Math.round((total * segment.weight) / totalWeight)

      allocated += value
      row[segment.key] = value
    })

    return row
  })
}

function buildCategoryBreakdownChartConfig(
  segments: CategoryBreakdownSegment[]
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
  const [showDummyData, setShowDummyData] = useState(true)
  const [activeStatus, setActiveStatus] = useState("valid")
  const [activeBreakdownCategory, setActiveBreakdownCategory] =
    useState<CategoryBreakdownKey>("valid")
  const [liveData, setLiveData] = useState<DashboardViewData | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState("")
  const activeDashboardData = showDummyData
    ? dashboardDemoData
    : liveData || emptyDashboardData
  const kpis = activeDashboardData.kpis.map((item, index) => ({
    ...item,
    icon: emptyKpis[index]?.icon || ShieldCheck,
  }))
  const distribution = activeDashboardData.distribution
  const historical = activeDashboardData.historical
  const historicalChartData = historical.map((item) => ({
    ...item,
    total: item.valid + item.invalid + item.risky + item.restricted,
  }))
  const visibleHistorical = historicalChartData.slice(-12)
  const activeBreakdownSegments = categoryBreakdownSeries[activeBreakdownCategory]
  const categoryBreakdownData = buildCategoryBreakdownRows(
    visibleHistorical,
    activeBreakdownCategory
  )
  const categoryBreakdownChartConfig = buildCategoryBreakdownChartConfig(
    activeBreakdownSegments
  )
  const distributionTotal = distribution.reduce(
    (total, item) => total + item.value,
    0
  )
  const emailStatusChartData = distribution.map((item, index) => {
    const status = toStatusKey(item.label)

    return {
      status,
      label: item.label,
      emails: item.value,
      fill: getEmailStatusColor(status, index),
    }
  })
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
              {distribution.length ? (
                <ChartContainer
                  config={emailStatusChartConfig}
                  className="mx-auto aspect-square h-[340px] w-full max-w-[380px]"
                >
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent hideLabel nameKey="status" />
                      }
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
              ) : (
                <div className="flex aspect-square w-full max-w-72 items-center justify-center self-center rounded-full bg-foreground p-16">
                  <div className="size-full rounded-full bg-background" />
                </div>
              )}
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
            {historical.length ? (
              <>
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
                  {categoryBreakdownKeys.map((status) => (
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
              </>
            ) : (
              <div className="flex min-h-60 items-end gap-3 border-b border-l px-4 py-3">
                <div className="grid w-full gap-8 py-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="border-t" />
                  ))}
                </div>
              </div>
            )}
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
            setActiveBreakdownCategory(value as CategoryBreakdownKey)
          }
        >
          <div className="overflow-x-auto pb-1">
            <TabsList
              variant="line"
              className="h-14 min-w-max rounded-full border bg-background p-0"
            >
              {categoryBreakdownKeys.map((status) => (
                <TabsTrigger
                  key={status}
                  value={status}
                  className="h-full min-w-24 rounded-none px-5 text-base after:bg-[#346ce6] group-data-horizontal/tabs:after:bottom-[-1px] first:rounded-l-full last:rounded-r-full"
                >
                  {historicalChartConfig[status].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <Card>
            <CardContent className="grid min-h-72 gap-5 pt-5 pb-6 sm:px-6">
              {categoryBreakdownData.length ? (
                <>
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
                </>
              ) : (
                <div className="flex min-h-60 items-end gap-3 border-b border-l px-4 py-3">
                  <div className="grid w-full gap-8 py-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="border-t" />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Tabs>
      </section>
    </div>
  )
}
