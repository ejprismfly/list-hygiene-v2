import type { ReactNode } from "react"

import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AuthFormShellProps = {
  title: string
  description?: string
  message?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AuthFormShell({
  title,
  description,
  message,
  children,
  footer,
  className,
}: AuthFormShellProps) {
  return (
    <section className={cn("grid w-full justify-items-center gap-6", className)}>
      <div className="grid justify-items-center gap-1 text-center">
        <h1 className="text-4xl font-semibold tracking-normal text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-xs text-sm font-medium text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {message ? <div className="w-full max-w-xs">{message}</div> : null}

      <Card className="w-full max-w-xs rounded-lg shadow-sm">
        <CardContent>
          {children}
        </CardContent>
        {footer ? (
          <CardFooter className="justify-center gap-1 border-0 bg-transparent pt-1 text-center text-sm">
            {footer}
          </CardFooter>
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
    <section className="grid w-full max-w-md justify-items-center gap-4 text-center">
      {icon ? <div className="text-foreground">{icon}</div> : null}
      <h1 className="text-3xl font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <div className="grid gap-2 text-sm font-medium text-muted-foreground">
        {description}
      </div>
      {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
    </section>
  )
}
