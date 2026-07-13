import { Alert, AlertDescription } from "@/components/ui/alert"
import type { AuthFormState } from "@/lib/auth-form"

export function AuthMessage({ state }: { state: AuthFormState }) {
  if (!state.message) {
    return null
  }

  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}
