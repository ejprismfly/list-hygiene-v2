export function safeNextPath(
  nextPath: string | null | undefined,
  fallback?: string
): string

export function getOrigin(
  configuredHost?: string | null,
  originHeader?: string | null,
  requestUrl?: string | null,
  options?: {
    cfVisitor?: string | null
    forwardedHost?: string | null
    forwardedProto?: string | null
    hostHeader?: string | null
  }
): string

export function buildInviteUrl(options: {
  requestUrl: string
  token: string
  configuredHost?: string | null
  cfVisitor?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  hostHeader?: string | null
  originHeader?: string | null
}): string

export function buildInviteAuthRedirectUrl(options: {
  requestUrl: string
  token: string
  configuredHost?: string | null
  cfVisitor?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  hostHeader?: string | null
  originHeader?: string | null
}): string
