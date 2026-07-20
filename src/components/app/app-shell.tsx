import Link from "next/link"
import {
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  Settings,
} from "lucide-react"

import { BrandLogo } from "@/components/app/brand-logo"
import { MobileMenu } from "@/components/app/mobile-menu"
import { WorkspaceRequiredGate } from "@/components/app/workspace-required-gate"
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
] as const

function WorkspaceControls({ showOrganization = false }: {
  showOrganization?: boolean
}) {
  return <WorkspaceSwitcher showOrganization={showOrganization} />
}

function NavLinks({ active }: Pick<AppShellProps, "active">) {
  return (
    <nav className="grid gap-1" aria-label="Primary">
      {navItems.map((item) => {
        const Icon = item.icon

        return (
          <Tooltip key={item.key}>
            <TooltipTrigger
              render={
                <Link
                  href={item.href}
                  className={buttonVariants({
                    variant: active === item.key ? "secondary" : "ghost",
                    className: cn("h-10 w-full justify-start gap-2 text-base"),
                  })}
                />
              }
            >
              <Icon className="size-5" />
              {item.label}
            </TooltipTrigger>
            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

function ProfileNavLink({
  active,
  userEmail,
}: Pick<AppShellProps, "active" | "userEmail">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/profile"
            className={buttonVariants({
              variant: active === "profile" ? "secondary" : "ghost",
              className: cn("group h-10 w-full justify-start gap-2 text-base"),
            })}
          />
        }
      >
        <CircleUserRound className="size-5" />
        <span className="min-w-0 flex-1 truncate group-hover:hidden">
          {userEmail}
        </span>
        <span className="hidden min-w-0 flex-1 truncate group-hover:block">
          Open Profile
        </span>
      </TooltipTrigger>
      <TooltipContent>Open Profile</TooltipContent>
    </Tooltip>
  )
}

export function AppShell({ active, userEmail, children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-background md:flex">
      <WorkspaceRequiredGate />

      <TooltipProvider delay={300}>
        <aside className="sticky top-0 hidden h-svh max-h-svh w-60 shrink-0 flex-col overflow-hidden border-r bg-background p-3 md:flex">
          <div className="shrink-0 px-2 py-3">
            <BrandLogo />
          </div>

          <Separator className="my-2 shrink-0" />

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <WorkspaceControls />

            <div className="mt-4">
              <NavLinks active={active} />
            </div>
          </div>

          <div className="shrink-0 px-2 pt-3 pb-1">
            <ProfileNavLink active={active} userEmail={userEmail} />
          </div>
        </aside>
      </TooltipProvider>

      <MobileMenu active={active} userEmail={userEmail} />

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
