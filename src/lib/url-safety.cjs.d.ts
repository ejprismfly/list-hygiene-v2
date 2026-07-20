export function safeNextPath(
  nextPath: string | null | undefined,
  fallback?: string
): string

export function getOrigin(
  configuredHost?: string | null,
  originHeader?: string | null,
  requestUrl?: string | null
): string

export function buildInviteUrl(options: {
  requestUrl: string
  token: string
  configuredHost?: string | null
  originHeader?: string | null
}): string
