import Link from "next/link"
import {
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react"

import { signOutAction } from "@/app/(auth)/actions"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type AppShellProps = {
  active: "dashboard" | "billing" | "profile" | "settings"
  userEmail: string
  children: React.ReactNode
}

const navItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "billing",
    label: "Billing",
    href: "/billing",
    icon: CreditCard,
  },
  {
    key: "profile",
    label: "Profile",
    href: "/profile",
    icon: CircleUserRound,
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
] as const

export function AppShell({ active, userEmail, children }: AppShellProps) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background p-3">
        <div className="px-2 py-3 text-base font-semibold">List Hygiene</div>
        <Separator className="my-2" />

        <div className="grid gap-2">
          <Select defaultValue="secondary">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Workspace</SelectItem>
              <SelectItem value="secondary">Secondary</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="w-full">
            + New workspace
          </Button>
          <Button variant="destructive" size="sm" className="w-full">
            Archive workspace
          </Button>
        </div>

        <nav className="mt-4 grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <Link
                key={item.key}
                href={item.href}
                className={buttonVariants({
                  variant: active === item.key ? "secondary" : "ghost",
                  className: cn("h-10 w-full justify-start gap-2 text-base"),
                })}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto grid gap-2 px-2 pb-1">
          <Badge variant="outline" className="w-fit max-w-full">
            <span className="truncate">{userEmail}</span>
          </Badge>
          <form action={signOutAction}>
            <Button type="submit" className="w-fit gap-2">
              <LogOut className="size-4" />
              Logout
            </Button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-8 md:p-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
