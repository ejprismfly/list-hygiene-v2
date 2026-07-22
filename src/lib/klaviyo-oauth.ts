"use client"

function randomString(length: number) {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)

  return Array.from(values, (value) => charset[value % charset.length]).join("")
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function klaviyoPopupFeatures() {
  const width = 520
  const height = 720
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - width) / 2)
  )
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - height) / 2)
  )

  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "status=no",
    "toolbar=no",
    "menubar=no",
  ].join(",")
}

export function openKlaviyoOAuthPopup() {
  return window.open("about:blank", "klaviyo-oauth", klaviyoPopupFeatures())
}

export async function startKlaviyoOAuth({
  onMissingClientId,
  popup: existingPopup,
}: {
  onMissingClientId?: () => void
  popup?: Window | null
} = {}) {
  const popup =
    existingPopup === undefined ? openKlaviyoOAuthPopup() : existingPopup
  const clientId = process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID

  if (!clientId) {
    popup?.close()
    onMissingClientId?.()
    return false
  }

  const verifier = randomString(64)
  const challenge = await codeChallenge(verifier)
  document.cookie = [
    `klaviyo_pkce_verifier=${verifier}`,
    "Path=/",
    `Max-Age=${10 * 60}`,
    "SameSite=Lax",
  ].join("; ")

  const appHost =
    process.env.NEXT_PUBLIC_APP_HOST?.replace(/\/+$/, "") ||
    window.location.origin
  const redirectUri = encodeURIComponent(
    `${appHost}/api/oauth/klaviyo/callback`
  )
  const scopes =
    "segments:read segments:write lists:read lists:write profiles:read profiles:write accounts:read subscriptions:write subscriptions:read"
  const authUrl = `https://www.klaviyo.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(
    scopes
  )}&code_challenge_method=S256&code_challenge=${challenge}`

  if (popup) {
    popup.location.href = authUrl
    popup.focus()
    return true
  }

  window.location.assign(authUrl)
  return true
}
