"use server"

import { headers } from "next/headers"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { AuthFormState } from "@/lib/auth-form"
import {
  getOrCreateDefaultOrganization,
} from "@/lib/api/tenant"
import { normalizedEmail } from "@/lib/api/validation"
import { getFormPassword, getFormString } from "@/lib/auth-form"
import { claimPasswordGrant, limitAuthAttempt, PASSWORD_GRANT_COOKIE } from "@/lib/auth-security"
import { AUTH_ANALYTICS_COOKIE } from "@/lib/auth-analytics"
import { ensureStripeCustomerOnRegistration } from "@/lib/billing/customer"
import {
  isOnboardingPath,
  SIGNUP_ONBOARDING_COOKIE,
  SIGNUP_ONBOARDING_COOKIE_MAX_AGE,
} from "@/lib/onboarding"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getOrigin, safeNextPath } from "@/lib/url-safety.cjs"
import {
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

const missingConfigState: AuthFormState = {
  status: "error",
  message:
    "Authentication is temporarily unavailable. Please try again later.",
  errorCode: "auth_unavailable",
}

function requireEmailAndPassword(email: string, password: string, creating = true) {
  if (!normalizedEmail(email)) {
    return "Enter a valid email address."
  }

  if (!password) {
    return "Email and password are required."
  }

  if (creating && password.length < 8) {
    return "Password must be at least 8 characters."
  }

  if (creating && password.length > 128) {
    return "Password must be 128 characters or less."
  }

  return null
}

async function getRequestOrigin() {
  const headerList = await headers()
  const configuredHost = process.env.NEXT_PUBLIC_APP_HOST?.replace(/\/+$/, "")

  return getOrigin(configuredHost, headerList.get("origin"), undefined, {
    cfVisitor: headerList.get("cf-visitor"),
    forwardedHost: headerList.get("x-forwarded-host"),
    forwardedProto: headerList.get("x-forwarded-proto"),
    hostHeader: headerList.get("host"),
  })
}

function getNextPath(formData: FormData) {
  return safeNextPath(getFormString(formData, "next"))
}

function buildAuthCallbackUrl(origin: string, nextPath: string, type?: string) {
  const url = new URL("/auth/callback", origin)
  if (nextPath !== "/dashboard") {
    url.searchParams.set("next", nextPath)
  }
  if (type) {
    url.searchParams.set("type", type)
  }

  return url.toString()
}

function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("auth-token")
}

async function clearPreviousAuthCookies() {
  const cookieStore = await cookies()

  cookieStore.delete(WORKSPACE_ORGANIZATION_COOKIE)
  cookieStore.delete(WORKSPACE_ID_COOKIE)
  cookieStore.delete(PASSWORD_GRANT_COOKIE)
  cookieStore.delete(SIGNUP_ONBOARDING_COOKIE)
  cookieStore.delete(AUTH_ANALYTICS_COOKIE)

  cookieStore.getAll().forEach((cookie) => {
    if (isSupabaseAuthCookie(cookie.name)) {
      cookieStore.delete(cookie.name)
    }
  })
}

async function setSignupOnboardingCookie(nextPath: string) {
  if (!isOnboardingPath(nextPath)) {
    return
  }

  const cookieStore = await cookies()
  cookieStore.set(SIGNUP_ONBOARDING_COOKIE, "1", {
    maxAge: SIGNUP_ONBOARDING_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  })
}

function isAlreadyRegisteredAuthError(message?: string) {
  return /already (been )?registered|user already registered/i.test(message || "")
}

function existingAccountState(email?: string, nextPath?: string): AuthFormState {
  return {
    status: "success",
    message: "If this address can receive a confirmation email, check your inbox and spam folder to continue.",
    email, nextPath,
  }
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normalizedEmail(getFormString(formData, "email")) || ""
  const password = getFormPassword(formData, "password")
  const nextPath = getNextPath(formData)
  const validationError = requireEmailAndPassword(email, password, false)

  if (validationError) {
    return { status: "error", message: validationError }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const limited = await limitAuthAttempt("login", email)
  if (limited) return limited

  await clearPreviousAuthCookies()

  const supabase = await createClient({ writable: true })

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { status: "error", errorCode: "invalid_credentials", message: "Unable to sign in. Check your email and password, and confirm your email if needed." }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to sign in right now. Please try again.",
    }
  }

  redirect(nextPath)
}

export async function signupAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normalizedEmail(getFormString(formData, "email")) || ""
  const password = getFormPassword(formData, "password")
  const nextPath = getNextPath(formData)
  const termsAccepted = formData.get("terms") === "on"
  const validationError = requireEmailAndPassword(email, password)

  if (validationError) {
    return { status: "error", message: validationError }
  }

  if (!termsAccepted) {
    return {
      status: "error",
      message: "You must accept the terms to create an account.",
    }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const limited = await limitAuthAttempt("email", email)
  if (limited) return limited

  const origin = await getRequestOrigin()
  const supabase = await createClient({ writable: true })
  let shouldRedirect = false

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(origin, nextPath, "signup"),
      },
    })

    if (error) {
      if (isAlreadyRegisteredAuthError(error.message)) {
        return existingAccountState(email, nextPath)
      }

      return { status: "error", errorCode: "auth_unavailable", message: "Unable to complete this request. Please try again later." }
    }

    if (data.user && !data.session && data.user.identities?.length === 0) {
      return existingAccountState(email, nextPath)
    }

    shouldRedirect = Boolean(data.session)
    if (data.user) {
      try {
        const adminSupabase = createAdminClient()
        const tenant = await getOrCreateDefaultOrganization(
          adminSupabase,
          data.user
        )

        if (!tenant.ok) {
          throw new Error(tenant.error)
        }

        await ensureStripeCustomerOnRegistration({
          supabase: adminSupabase,
          user: data.user,
        })
      } catch {
        console.error("Registration bootstrap needs retry", { code: "registration_bootstrap_failed", userId: data.user.id })
      }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to create the account right now. Please try again.",
    }
  }

  if (shouldRedirect) {
    await setSignupOnboardingCookie(nextPath)
    redirect(nextPath)
  }

  return {
    status: "success",
    message: "If this address can receive a confirmation email, check your inbox and spam folder to continue.",
    email,
    nextPath,
  }
}

export async function resendSignupConfirmationAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normalizedEmail(getFormString(formData, "email")) || ""
  const nextPath = getNextPath(formData)

  if (!normalizedEmail(email)) {
    return { status: "error", message: "Enter a valid email address." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const limited = await limitAuthAttempt("email", email)
  if (limited) return limited

  const origin = await getRequestOrigin()
  const supabase = await createClient({ writable: true })

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(origin, nextPath, "signup"),
      },
    })

    if (error) {
      if (isAlreadyRegisteredAuthError(error.message)) {
        return existingAccountState(email, nextPath)
      }

      return existingAccountState(email, nextPath)
    }
  } catch {
    return {
      status: "error",
      message: "Unable to resend the confirmation email right now.",
      email,
      nextPath,
    }
  }

  return {
    status: "success",
    message: "If this address can receive a confirmation email, check your inbox and spam folder to continue.",
    email,
    nextPath,
  }
}

export async function forgotPasswordAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normalizedEmail(getFormString(formData, "email")) || ""

  if (!normalizedEmail(email)) {
    return { status: "error", message: "Enter a valid email address." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const limited = await limitAuthAttempt("email", email)
  if (limited) return limited

  const origin = await getRequestOrigin()
  const callbackUrl = buildAuthCallbackUrl(origin, getNextPath(formData), "recovery")
  const supabase = await createClient({ writable: true })

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl,
    })

    if (error) {
      if (error.status && error.status >= 500) return missingConfigState
      return { status: "success", message: "If this address can receive a reset email, check your inbox and spam folder." }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to send a reset link right now. Please try again.",
    }
  }

  return {
    status: "success",
    message: "If this address can receive a reset email, check your inbox and spam folder.",
  }
}

export async function resetPasswordAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = getFormPassword(formData, "password")
  const confirmPassword = getFormPassword(formData, "confirmPassword")

  if (!password || !confirmPassword) {
    return { status: "error", message: "Both password fields are required." }
  }

  if (password.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." }
  }

  if (password.length > 128) {
    return { status: "error", message: "Password must be 128 characters or less." }
  }

  if (password !== confirmPassword) {
    return { status: "error", message: "Passwords do not match." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  let grant
  try { grant = await claimPasswordGrant() } catch { return missingConfigState }
  if (!grant) return { status: "error", errorCode: "invalid_recovery", message: "This password link is invalid or expired. Request a new link." }
  const supabase = grant.supabase

  try {
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      return { status: "error", errorCode: "auth_unavailable", message: "Unable to complete this request. Please try again later." }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to update the password right now. Please try again.",
    }
  }

  let revoked = false
  try { const { error } = await supabase.auth.signOut({ scope: "global" }); revoked = !error } catch {}
  await clearPreviousAuthCookies()
  if (!revoked) return { status: "error", errorCode: "session_revocation_failed", message: "Your password changed, but session cleanup failed. Request a new reset link before continuing." }
  redirect(`/login?${new URLSearchParams({ next: grant.nextPath, password_reset: "1" })}`)
}

export async function signOutAction() {
  try {
    if (getSupabaseConfig()) {
      const supabase = await createClient({ writable: true })
      const { error } = await supabase.auth.signOut({ scope: "global" })
      if (error) throw new Error("Session revocation failed")
    }
  } catch {
    await clearPreviousAuthCookies()
    redirect("/login?error=session_revocation_failed")
  }
  await clearPreviousAuthCookies()
  redirect("/login")
}
