"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import type {
  LegendPayload,
  TooltipContentProps,
  TooltipPayloadEntry,
} from "recharts"

import { cn } from "@/lib/utils"

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode
    color?: string
  }
}

const ChartContext = React.createContext<{
  config: ChartConfig
} | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a ChartContainer")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs text-muted-foreground [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-wrapper]:outline-hidden",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip
const ChartLegend = RechartsPrimitive.Legend

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  hideIndicator = false,
  nameKey,
}: React.ComponentProps<"div"> &
  Partial<TooltipContentProps<number | string, string>> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    nameKey?: string
  }) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "grid min-w-32 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-xl",
        className
      )}
    >
      {!hideLabel && label ? (
        <div className="font-medium">{label}</div>
      ) : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const itemConfig = getPayloadConfig(config, item, nameKey)
          const label = itemConfig?.label ?? item.name
          const color = itemConfig?.color ?? item.payload?.fill ?? item.color
          const value =
            typeof item.value === "number"
              ? item.value.toLocaleString()
              : item.value

          return (
            <div
              key={`${item.dataKey || item.name || index}`}
              className="flex min-w-0 items-center gap-2"
            >
              {!hideIndicator ? (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {label}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean
  payload?: ReadonlyArray<LegendPayload>
  verticalAlign?: "top" | "bottom" | "middle"
  nameKey?: string
}) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const itemConfig = getPayloadConfig(config, item, nameKey)
        const label = itemConfig?.label ?? item.value
        const color = itemConfig?.color ?? item.color

        return (
          <div
            key={`${item.dataKey || item.value}`}
            className="flex items-center gap-1.5"
          >
            {!hideIcon ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
            ) : null}
            <span className="text-muted-foreground">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function getPayloadConfig(
  config: ChartConfig,
  item: TooltipPayloadEntry | LegendPayload,
  nameKey?: string
) {
  const itemPayload = isObject(item.payload) ? item.payload : undefined
  const itemName =
    "name" in item && typeof item.name === "string" ? item.name : undefined
  const itemDataKey =
    typeof item.dataKey === "string" ? item.dataKey : undefined
  const configKey =
    nameKey && itemPayload && typeof itemPayload[nameKey] === "string"
      ? itemPayload[nameKey]
      : itemName
        ? itemName
        : itemDataKey

  if (configKey && configKey in config) {
    return config[configKey]
  }

  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent }
