"use server"

import { headers } from "next/headers"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { Provider } from "@supabase/supabase-js"

import type { AuthFormState } from "@/lib/auth-form"
import { getFormString } from "@/lib/auth-form"
import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/url-safety.cjs"
import {
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

const missingConfigState: AuthFormState = {
  status: "error",
  message:
    "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your local env.",
}

function requireEmailAndPassword(email: string, password: string) {
  if (!email || !password) {
    return "Email and password are required."
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters."
  }

  return null
}

function isSupportedOAuthProvider(provider: string): provider is Provider {
  return provider === "google" || provider === "github"
}

async function getRequestOrigin() {
  const headerList = await headers()
  const configuredHost = process.env.NEXT_PUBLIC_APP_HOST?.replace(/\/+$/, "")

  return configuredHost || headerList.get("origin") || "http://localhost:3000"
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

function isAlreadyRegisteredAuthError(message?: string) {
  return /already (been )?registered|user already registered/i.test(message || "")
}

function existingAccountState(email?: string, nextPath?: string): AuthFormState {
  return {
    status: "error",
    message:
      "An account with this email already exists. Please log in, or reset your password if you cannot access it.",
    email,
    nextPath,
  }
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")
  const password = getFormString(formData, "password")
  const nextPath = getNextPath(formData)
  const validationError = requireEmailAndPassword(email, password)

  if (validationError) {
    return { status: "error", message: validationError }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { status: "error", message: error.message }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to sign in right now. Please try again.",
    }
  }

  redirect(nextPath)
}

export async function magicLinkAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")
  const nextPath = getNextPath(formData)

  if (!email) {
    return { status: "error", message: "Email is required." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const origin = await getRequestOrigin()
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(origin, nextPath),
        shouldCreateUser: true,
      },
    })

    if (error) {
      return { status: "error", message: error.message }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to send a sign-in link right now. Please try again.",
    }
  }

  return {
    status: "success",
    message: "Check your email for a sign-in link.",
  }
}

export async function oauthSignInAction(formData: FormData) {
  const provider = getFormString(formData, "provider")
  const nextPath = getNextPath(formData)

  if (!isSupportedOAuthProvider(provider)) {
    redirect("/login")
  }

  if (!getSupabaseConfig()) {
    redirect("/login")
  }

  const origin = await getRequestOrigin()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: buildAuthCallbackUrl(origin, nextPath),
    },
  })

  if (error || !data.url) {
    redirect("/login")
  }

  redirect(data.url)
}

export async function signupAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")
  const password = getFormString(formData, "password")
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

  const origin = await getRequestOrigin()
  const supabase = await createClient()
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

      return { status: "error", message: error.message }
    }

    if (data.user && !data.session && data.user.identities?.length === 0) {
      return existingAccountState(email, nextPath)
    }

    shouldRedirect = Boolean(data.session)
  } catch {
    return {
      status: "error",
      message: "Unable to create the account right now. Please try again.",
    }
  }

  if (shouldRedirect) {
    redirect(nextPath)
  }

  return {
    status: "success",
    message: "Account created. Check your email to finish signing in.",
    email,
    nextPath,
  }
}

export async function resendSignupConfirmationAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")
  const nextPath = getNextPath(formData)

  if (!email) {
    return { status: "error", message: "Email is required." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const origin = await getRequestOrigin()
  const supabase = await createClient()

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

      return { status: "error", message: error.message, email, nextPath }
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
    message: "Confirmation email resent. Check your inbox and spam folder.",
    email,
    nextPath,
  }
}

export async function forgotPasswordAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")

  if (!email) {
    return { status: "error", message: "Email is required." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const origin = await getRequestOrigin()
  const callbackUrl = buildAuthCallbackUrl(origin, "/dashboard", "recovery")
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl,
    })

    if (error) {
      return { status: "error", message: error.message }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to send a reset link right now. Please try again.",
    }
  }

  return {
    status: "success",
    message: "If the email exists, a reset link has been sent.",
  }
}

export async function resetPasswordAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = getFormString(formData, "password")
  const confirmPassword = getFormString(formData, "confirmPassword")
  const nextPath = getNextPath(formData)

  if (!password || !confirmPassword) {
    return { status: "error", message: "Both password fields are required." }
  }

  if (password.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." }
  }

  if (password !== confirmPassword) {
    return { status: "error", message: "Passwords do not match." }
  }

  if (!getSupabaseConfig()) {
    return missingConfigState
  }

  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      return { status: "error", message: error.message }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to update the password right now. Please try again.",
    }
  }

  redirect(nextPath)
}

export async function signOutAction() {
  if (getSupabaseConfig()) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }

  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_ORGANIZATION_COOKIE)
  cookieStore.delete(WORKSPACE_ID_COOKIE)

  redirect("/login")
}
