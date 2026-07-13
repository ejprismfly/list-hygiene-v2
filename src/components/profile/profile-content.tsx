import { Mail, MessageCircle } from "lucide-react"

import { signOutAction } from "@/app/(auth)/actions"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function ProfileContent({ email }: { email: string }) {
  return (
    <div className="grid gap-10">
      <section className="grid gap-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-normal">
            Account Information
          </h1>
          <form action={signOutAction}>
            <Button type="submit">Logout</Button>
          </form>
        </div>

        <div className="grid gap-4">
          <p className="text-lg">Email Address</p>
          <Card className="w-fit">
            <CardContent className="flex items-center gap-2">
              <Mail className="size-4" />
              <span>{email}</span>
            </CardContent>
          </Card>
          <a
            href="/forgot-password"
            className={buttonVariants({
              variant: "link",
              className: "w-fit px-0",
            })}
          >
            Reset Password
          </a>
        </div>
      </section>

      <Separator />

      <section className="grid gap-6">
        <h2 className="text-3xl font-semibold tracking-normal">Notifications</h2>
        <div className="grid gap-4">
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-lg">
                <Mail className="size-5" />
                Email
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-lg">
                <MessageCircle className="size-5" />
                Slack
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
