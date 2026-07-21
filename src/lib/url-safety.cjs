function safeNextPath(nextPath, fallback = "/dashboard") {
  if (typeof nextPath !== "string") {
    return fallback
  }

  const trimmed = nextPath.trim()
  if (
    !trimmed ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return fallback
  }

  return trimmed
}

function getOrigin(configuredHost, originHeader, requestUrl) {
  const candidates = [configuredHost, originHeader, requestUrl]

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue
    }

    try {
      return new URL(candidate.trim()).origin
    } catch {
      continue
    }
  }

  return "http://localhost:3000"
}

function buildInviteUrl({
  requestUrl,
  token,
  configuredHost,
  originHeader,
}) {
  const origin = getOrigin(configuredHost, originHeader, requestUrl)
  const url = new URL("/invite", origin)
  url.searchParams.set("token", token)

  return url.toString()
}

function buildInviteAuthRedirectUrl({
  requestUrl,
  token,
  configuredHost,
  originHeader,
}) {
  const origin = getOrigin(configuredHost, originHeader, requestUrl)
  const inviteUrl = new URL("/invite", origin)
  inviteUrl.searchParams.set("token", token)

  const passwordUrl = new URL("/reset-password", origin)
  passwordUrl.searchParams.set("next", `${inviteUrl.pathname}${inviteUrl.search}`)

  const callbackUrl = new URL("/auth/callback", origin)
  callbackUrl.searchParams.set(
    "next",
    `${passwordUrl.pathname}${passwordUrl.search}`
  )

  return callbackUrl.toString()
}

module.exports = {
  buildInviteAuthRedirectUrl,
  buildInviteUrl,
  getOrigin,
  safeNextPath,
}
