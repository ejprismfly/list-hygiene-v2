import assert from "node:assert/strict"
import test from "node:test"

import urlSafety from "../src/lib/url-safety.cjs"

const { buildInviteUrl, getOrigin, safeNextPath } = urlSafety

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
