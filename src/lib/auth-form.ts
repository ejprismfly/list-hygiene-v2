export type AuthFormState = {
  status: "idle" | "success" | "error"
  message: string
  errorCode?: string
  retryAfterSeconds?: number
  email?: string
  nextPath?: string
}

export const AUTH_FORM_INITIAL_STATE: AuthFormState = {
  status: "idle",
  message: "",
}

export function getFormString(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value.trim() : ""
}

// Passwords are opaque credentials: whitespace is significant.
export function getFormPassword(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}
