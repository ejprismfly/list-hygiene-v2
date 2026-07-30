export const SIGNUP_ONBOARDING_COOKIE = "lh_signup_onboarding"
export const SIGNUP_ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export function isOnboardingPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding?")
}
