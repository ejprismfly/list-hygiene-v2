const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && emailPattern.test(email) ? email : null
}

export function oneOfNumber(value: unknown, allowed: readonly number[]) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && allowed.includes(parsed) ? parsed : null
}

export function boundedInteger(
  value: string | null,
  { fallback, max, min }: { fallback: number; max: number; min: number }
) {
  if (value === null || value === "") return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
}
