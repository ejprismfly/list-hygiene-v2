import type { ReactNode } from "react"

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
    <section className={cn("grid w-full gap-6", className)}>
      {message ? <div className="w-full">{message}</div> : null}

      <Card className="w-full">
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
