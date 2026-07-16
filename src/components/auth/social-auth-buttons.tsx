"use client"

import { Code2, Search } from "lucide-react"

import { oauthSignInAction } from "@/app/(auth)/actions"
import { Button } from "@/components/ui/button"

const providers = [
  {
    id: "google",
    label: "Continue with Google",
    icon: Search,
  },
  {
    id: "github",
    label: "Continue with GitHub",
    icon: Code2,
  },
]

export function SocialAuthButtons() {
  return (
    <div className="grid gap-2">
      {providers.map((provider) => {
        const Icon = provider.icon

        return (
          <form key={provider.id} action={oauthSignInAction}>
            <input type="hidden" name="provider" value={provider.id} />
            <Button type="submit" variant="outline" className="w-full gap-2">
              <Icon className="size-4" />
              {provider.label}
            </Button>
          </form>
        )
      })}
    </div>
  )
}
