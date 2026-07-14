"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react"

import { signOutAction } from "@/app/(auth)/actions"
import { BrandLogo } from "@/components/app/brand-logo"
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { demoWorkspaceContext } from "@/lib/demo-data"
import { cn } from "@/lib/utils"

type MobileMenuProps = {
  active: "dashboard" | "billing" | "profile" | "settings"
  userEmail: string
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

export function MobileMenu({ active, userEmail }: MobileMenuProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    window.addEventListener("keydown", closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 md:hidden">
        <div className="min-w-0">
          <BrandLogo />
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>

        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Menu className="size-4" />
          Menu
        </Button>
      </header>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-[60] grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] bg-background p-4 md:hidden"
        >
          <div className="flex items-center justify-between gap-3 border-b pb-4">
            <h2 className="text-base font-semibold">Menu</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid min-h-0 content-start gap-4 overflow-y-auto py-4">
            <WorkspaceSwitcher
              organizationName={demoWorkspaceContext.organizationName}
              workspaces={demoWorkspaceContext.workspaces}
              showOrganization={false}
            />

            <Separator />

            <nav className="grid gap-1">
              {navItems.map((item) => {
                const Icon = item.icon

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
          </div>

          <div className="grid gap-3 border-t bg-background pt-4">
            <Badge variant="outline" className="w-fit max-w-full">
              <span className="truncate">{userEmail}</span>
            </Badge>
            <form action={signOutAction}>
              <Button type="submit" className="w-full gap-2">
                <LogOut className="size-4" />
                Logout
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
