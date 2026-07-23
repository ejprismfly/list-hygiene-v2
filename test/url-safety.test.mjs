import assert from "node:assert/strict"
import test from "node:test"

import urlSafety from "../src/lib/url-safety.cjs"

const { buildInviteAuthRedirectUrl, buildInviteUrl, getOrigin, safeNextPath } =
  urlSafety

test("safeNextPath keeps relative app paths", () => {
  assert.equal(safeNextPath("/invite?token=abc"), "/invite?token=abc")
  assert.equal(safeNextPath("/dashboard"), "/dashboard")
})

test("safeNextPath rejects external or malformed paths", () => {
  assert.equal(safeNextPath("https://example.com"), "/dashboard")
  assert.equal(safeNextPath("//example.com"), "/dashboard")
  assert.equal(safeNextPath("\\\\example.com"), "/dashboard")
  assert.equal(safeNextPath(""), "/dashboard")
})

test("getOrigin prefers configured host over request origin", () => {
  assert.equal(
    getOrigin("https://beta.listhygiene.com/app", "https://ignored.test", ""),
    "https://beta.listhygiene.com"
  )
})

test("getOrigin prefers forwarded public host before internal request URL", () => {
  assert.equal(
    getOrigin(null, null, "http://localhost:3000/api/organizations/invitations", {
      forwardedHost: "beta.listhygiene.com",
      forwardedProto: "https",
      hostHeader: "localhost:3000",
    }),
    "https://beta.listhygiene.com"
  )
})

test("getOrigin uses Cloudflare visitor scheme with public host", () => {
  assert.equal(
    getOrigin(null, null, "http://localhost:3000/auth/callback", {
      cfVisitor: '{"scheme":"https"}',
      hostHeader: "beta.listhygiene.com",
    }),
    "https://beta.listhygiene.com"
  )
})

test("buildInviteUrl uses the active origin and encodes the token", () => {
  assert.equal(
    buildInviteUrl({
      requestUrl: "https://fallback.test/api/organizations/invitations",
      originHeader: "https://beta.listhygiene.com",
      token: "abc 123",
    }),
    "https://beta.listhygiene.com/invite?token=abc+123"
  )
})

test("buildInviteAuthRedirectUrl ignores localhost request URL behind proxy", () => {
  assert.equal(
    buildInviteAuthRedirectUrl({
      requestUrl: "http://localhost:3000/api/organizations/invitations",
      forwardedHost: "beta.listhygiene.com",
      forwardedProto: "https",
      hostHeader: "localhost:3000",
      token: "abc 123",
    }),
    "https://beta.listhygiene.com/auth/invite-callback?next=%2Freset-password%3Fnext%3D%252Finvite%253Ftoken%253Dabc%252B123"
  )
})

test("buildInviteAuthRedirectUrl sends Supabase invite email through callback", () => {
  assert.equal(
    buildInviteAuthRedirectUrl({
      requestUrl: "https://fallback.test/api/organizations/invitations",
      originHeader: "https://beta.listhygiene.com",
      token: "abc 123",
    }),
    "https://beta.listhygiene.com/auth/invite-callback?next=%2Freset-password%3Fnext%3D%252Finvite%253Ftoken%253Dabc%252B123"
  )
})
