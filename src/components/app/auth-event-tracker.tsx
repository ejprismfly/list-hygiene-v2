"use client"

import { useEffect } from "react"

import {
  AUTH_ANALYTICS_COOKIE,
  decodeAuthAnalyticsCookie,
  SIGNUP_VERIFIED_EVENT,
} from "@/lib/auth-analytics"
import { trackAuthEvent, TRACKING_EVENTS } from "@/lib/tracking-events"

function getCookieValue(name: string) {
  const prefix = `${name}=`

  return (
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(prefix))
      ?.slice(prefix.length) || ""
  )
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
}

export function AuthEventTracker() {
  useEffect(() => {
    const payload = decodeAuthAnalyticsCookie(
      getCookieValue(AUTH_ANALYTICS_COOKIE)
    )

    if (!payload) {
      return
    }

    clearCookie(AUTH_ANALYTICS_COOKIE)

    if (payload.event === SIGNUP_VERIFIED_EVENT) {
      trackAuthEvent(TRACKING_EVENTS.auth.signupVerified, {
        email: payload.email,
      })
    }
  }, [])

  return null
}
