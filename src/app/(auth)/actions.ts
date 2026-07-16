"use server"

import { headers } from "next/headers"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { Provider } from "@supabase/supabase-js"

import type { AuthFormState } from "@/lib/auth-form"
import { getFormString } from "@/lib/auth-form"
import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
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

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = getFormString(formData, "email")
  const password = getFormString(formData, "password")
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

  redirect("/dashboard")
}

export async function magicLinkAction(
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
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
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
      redirectTo: `${origin}/auth/callback`,
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

  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      return { status: "error", message: error.message }
    }
  } catch {
    return {
      status: "error",
      message: "Unable to create the account right now. Please try again.",
    }
  }

  return {
    status: "success",
    message: "Account created. Check your email to finish signing in.",
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
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?type=recovery`,
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

  redirect("/dashboard")
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
