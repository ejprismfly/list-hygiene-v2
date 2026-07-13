import {
  BadgeCheck,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

const milestoneLabels = ["10", "100", "500", "1k", "10k", "100k", "500k", "1m"]

const kpis = [
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

export function DashboardContent() {
  return (
    <div className="grid gap-8">
      <Card>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <p className="text-base font-medium">
              Welcome. Take a look at what your dashboard will look like soon!
            </p>
            <p className="text-sm text-muted-foreground">
              Toggle on or off to see dummy data.
            </p>
          </div>
          <Switch aria-label="Toggle dummy data" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hit Your Hygiene Milestones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span>Total Suppressed Emails:</span>
            <span>Wipe out 10 more to level up!</span>
          </div>
          <div className="grid gap-2">
            <div className="relative mx-6 h-8">
              <div className="absolute top-4 right-0 left-0 border-t" />
              {milestoneLabels.map((label, index) => (
                <div
                  key={label}
                  className="absolute top-2 flex -translate-x-1/2 flex-col items-center gap-1"
                  style={{ left: `${(index / (milestoneLabels.length - 1)) * 100}%` }}
                >
                  <span className="size-5 rounded-full border bg-background" />
                </div>
              ))}
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
        <h1 className="text-3xl font-semibold tracking-normal">July 2026</h1>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.85fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {kpis.map((item) => {
              const Icon = item.icon

              return (
                <Card key={item.label}>
                  <CardContent className="grid min-h-40 gap-4">
                    <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-7" />
                    </div>
                    <div className="mt-auto grid gap-1">
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="text-4xl font-semibold">{item.value}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardContent className="flex min-h-full flex-col items-center justify-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="size-4 rounded-full bg-foreground" />
                No Data
              </div>
              <div className="flex aspect-square w-full max-w-72 items-center justify-center rounded-full bg-foreground p-16">
                <div className="size-full rounded-full bg-background" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6">
        <h2 className="text-3xl font-semibold tracking-normal">
          Historical Performance
        </h2>
        <Card>
          <CardContent className="grid min-h-72 gap-4">
            <div className="grid grid-cols-[2rem_1fr] gap-3 text-xs text-muted-foreground">
              <div className="grid content-between py-2">
                {["1.0", "0.8", "0.6", "0.4", "0.2", "0"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="grid gap-8 py-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="border-t" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
