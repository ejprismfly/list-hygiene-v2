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

module.exports = {
  buildInviteUrl,
  getOrigin,
  safeNextPath,
}
