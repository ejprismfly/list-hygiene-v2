"use client"

import { LogOut } from "lucide-react"

import { signOutAction } from "@/app/(auth)/actions"
import { Button } from "@/components/ui/button"
import { clearWorkspaceClientState } from "@/lib/workspace-utils"

type LogoutFormProps = {
  fullWidth?: boolean
  showIcon?: boolean
}

export function LogoutForm({
  fullWidth = false,
  showIcon = false,
}: LogoutFormProps) {
  return (
    <form
      action={signOutAction}
      onSubmit={() => {
        clearWorkspaceClientState(window.localStorage)
      }}
    >
      <Button type="submit" className={fullWidth ? "w-full gap-2" : "w-fit gap-2"}>
        {showIcon && <LogOut className="size-4" />}
        Logout
      </Button>
    </form>
  )
}
