import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AuthFormShellProps = {
  title: string
  description?: string
  message?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  loading?: boolean
  loadingLabel?: string
}

export function AuthFormShell({
  title,
  description,
  message,
  children,
  footer,
  className,
  loading = false,
  loadingLabel = "Working",
}: AuthFormShellProps) {
  return (
    <section className={cn("grid w-full gap-6", className)}>
      {message ? <div className="w-full">{message}</div> : null}

      <Card className="relative w-full overflow-hidden" aria-busy={loading}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {children}
        </CardContent>
        {footer ? (
          <CardFooter className="justify-center gap-1 text-center text-sm">
            {footer}
          </CardFooter>
        ) : null}
        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm">
            <div className="grid justify-items-center gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
              <Loader2 className="size-8 animate-spin text-primary" />
              <div className="grid justify-items-center gap-1">
                <p className="text-sm font-medium">{loadingLabel}</p>
                <div className="flex items-center gap-1" aria-hidden="true">
                  <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  )
}

type AuthSuccessStateProps = {
  icon?: ReactNode
  title: string
  description: ReactNode
  footer?: ReactNode
}

export function AuthSuccessState({
  icon,
  title,
  description,
  footer,
}: AuthSuccessStateProps) {
  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        {icon ? <div className="text-foreground">{icon}</div> : null}
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="grid gap-2">{description}</CardDescription>
      </CardHeader>
      {footer ? (
        <CardFooter className="justify-center text-center text-sm">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  )
}
