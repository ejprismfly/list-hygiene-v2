export const AUTH_ANALYTICS_COOKIE = "lh_auth_analytics"
export const AUTH_ANALYTICS_COOKIE_MAX_AGE = 300
export const SIGNUP_VERIFIED_EVENT = "signup_verified"

export type AuthAnalyticsCookiePayload = {
  event: typeof SIGNUP_VERIFIED_EVENT
  email: string
}

export function encodeAuthAnalyticsCookie(
  payload: AuthAnalyticsCookiePayload
) {
  return encodeURIComponent(JSON.stringify(payload))
}

export function decodeAuthAnalyticsCookie(value: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<
      string,
      unknown
    >
    const email = typeof parsed.email === "string" ? parsed.email.trim() : ""

    if (parsed.event === SIGNUP_VERIFIED_EVENT && email) {
      return {
        event: SIGNUP_VERIFIED_EVENT,
        email,
      } satisfies AuthAnalyticsCookiePayload
    }
  } catch {
    return null
  }

  return null
}
