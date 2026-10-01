function safeNextPath(nextPath, fallback = "/dashboard") {
  if (typeof nextPath !== "string") {
    return fallback
  }

  // URL parsers remove control characters before resolving network paths.
  // Reject them before parsing, including encoded forms that may be decoded later.
  if (/[\u0000-\u0020\u007f\\]/.test(nextPath) || /%(?:0[0-9a-f]|1[0-9a-f]|20|7f|5c)/i.test(nextPath)) {
    return fallback
  }
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallback
  try {
    const base = "https://listhygiene.local"
    const parsed = new URL(nextPath, base)
    if (parsed.origin !== base || parsed.pathname.startsWith("//")) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

function firstHeaderValue(value) {
  return typeof value === "string" ? value.split(",")[0]?.trim() || "" : ""
}

function urlOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  try {
    return new URL(value.trim()).origin
  } catch {
    return null
  }
}

function protocolFrom(value) {
  const protocol = firstHeaderValue(value).replace(/:$/, "").toLowerCase()
  return protocol === "http" || protocol === "https" ? protocol : ""
}

function protocolFromCloudflareVisitor(value) {
  if (typeof value !== "string" || !value.trim()) {
    return ""
  }

  try {
    const parsed = JSON.parse(value)
    return protocolFrom(
      parsed && typeof parsed.scheme === "string" ? parsed.scheme : ""
    )
  } catch {
    return ""
  }
}

function protocolFromUrl(value) {
  try {
    return new URL(value).protocol.replace(/:$/, "")
  } catch {
    return ""
  }
}

function hostOrigin(hostHeader, protocol) {
  const host = firstHeaderValue(hostHeader)
  if (!host) {
    return null
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    return urlOrigin(host)
  }

  const fallbackProtocol =
    /^localhost(?::|$)/i.test(host) || /^127\./.test(host) ? "http" : "https"

  return urlOrigin(`${protocol || fallbackProtocol}://${host}`)
}

function getOrigin(configuredHost, originHeader, requestUrl, options = {}) {
  if (process.env.NODE_ENV === "production") {
    const canonical = urlOrigin(configuredHost)
    if (!canonical || !canonical.startsWith("https://")) {
      throw new Error("A canonical HTTPS NEXT_PUBLIC_APP_HOST is required")
    }
    return canonical
  }
  const requestProtocol = protocolFromUrl(requestUrl)
  const publicProtocol =
    protocolFrom(options.forwardedProto) ||
    protocolFromCloudflareVisitor(options.cfVisitor) ||
    requestProtocol ||
    "https"
  const forwardedOrigin = hostOrigin(
    options.forwardedHost,
    publicProtocol
  )
  const hostHeaderOrigin = hostOrigin(
    options.hostHeader,
    publicProtocol
  )
  const candidates = [
    urlOrigin(configuredHost),
    forwardedOrigin,
    urlOrigin(originHeader),
    hostHeaderOrigin,
    urlOrigin(requestUrl),
  ]

  for (const candidate of candidates) {
    if (candidate) {
      return candidate
    }
  }

  return "http://localhost:3000"
}

function buildInviteUrl({
  requestUrl,
  token,
  configuredHost,
  cfVisitor = null,
  forwardedHost = null,
  forwardedProto = null,
  hostHeader = null,
  originHeader = null,
}) {
  const origin = getOrigin(configuredHost, originHeader, requestUrl, {
    cfVisitor,
    forwardedHost,
    forwardedProto,
    hostHeader,
  })
  const url = new URL("/invite", origin)
  url.searchParams.set("token", token)

  return url.toString()
}

function buildInviteAuthRedirectUrl({
  requestUrl,
  token,
  configuredHost,
  cfVisitor = null,
  forwardedHost = null,
  forwardedProto = null,
  hostHeader = null,
  originHeader = null,
}) {
  const origin = getOrigin(configuredHost, originHeader, requestUrl, {
    cfVisitor,
    forwardedHost,
    forwardedProto,
    hostHeader,
  })
  const inviteUrl = new URL("/invite", origin)
  inviteUrl.searchParams.set("token", token)

  const passwordUrl = new URL("/reset-password", origin)
  passwordUrl.searchParams.set("next", `${inviteUrl.pathname}${inviteUrl.search}`)

  const callbackUrl = new URL("/auth/invite-callback", origin)
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
