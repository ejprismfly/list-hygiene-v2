# Authentication hardening release

Candidate branch: `fix/authentication-hardening`. Baseline: `dfc13e03d2f1859e2af2267741f0e3c93de3ba8f` (App V2's deployed commit). The original working checkout and unrelated pending billing/reporting changes remain separate.

## Changes

- Require a verified Auth identity and an existing, unexpired session for app/API access. RLS also checks `auth.sessions` so revoked JWTs lose direct database access.
- Preserve passwords exactly; normalize emails. Login accepts existing short passwords; creation and resets require 8–128 characters.
- Use a configured HTTPS origin in production, reject unsafe redirect paths, missing/ambiguous callback credentials, unsupported methods and reused confirmation tokens. Repeated identical `type` parameters remain compatible with the existing signup template.
- Neutral signup/recovery responses, sanitized provider errors, shared database throttles. Login: 10 attempts/15 minutes per recipient and trusted IP. Email operations: recipient cooldown 60 seconds and five/hour per recipient and IP/recipient. Missing limiter infrastructure denies requests.
- Single-use, 15-minute password grants bound to user/session/purpose. Successful reset revokes all sessions and redirects to login with the original destination. A signed, fresh OTP session plus a matching pending invitation supports Supabase implicit invite links.
- Invitations always remain pending until the verified recipient explicitly accepts. Acceptance preserves existing higher roles, checks the inviter's current permissions on every workspace, rejects disabled members, and commits all memberships and acceptance together. Create/resend/revoke hold the invitation lock through email delivery; delivery failure rolls the database change back.
- Existing accounts receive a clearly labeled manual invitation link; new accounts use Supabase invitation email. Member POST is an invitation alias returning 202.
- Member role/status/removal changes are atomic. Organization-wide status changes require manager access to every affected workspace and cannot disable an owner. Provisioning cannot reclaim transferred ownership or reactivate disabled membership.
- Cookie-authenticated API mutations require the configured request origin. Server workers require service-role credentials. Stripe registration mapping uses inserts with unique-conflict recovery instead of unsupported partial-index upserts; workspace metadata and idempotency recover prior customer creation.
- Next.js 16.3.6 and compatible dependency security updates.

## Configuration

`NEXT_PUBLIC_APP_HOST=https://app.listhygiene.com`, public Supabase config, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` are required in production. Dokploy uses Node 22.

`AUTH_SECURITY_SECRET` may be set to a dedicated persistent random secret; otherwise HMAC identifiers use the existing service-role secret. Leave `AUTH_TRUST_PROXY` unset until ingress is confirmed to overwrite `cf-connecting-ip` and prevent direct origin access. Without this flag, a conservative shared ingress bucket plus independent recipient limits apply; client-provided forwarded headers cannot evade limits.

Supabase management access verified the live project and configuration. Email confirmation is required, anonymous users are disabled, and the provider password minimum now matches the app’s eight characters. Branded subjects and content are published. Custom SMTP still requires the actual Mailgun SMTP password; management responses expose a secret fingerprint, which cannot be reused as a credential. Preserve the password-only app configuration and required email confirmation.

## Release sequence

1. Rehearse schema-only live snapshot with synthetic Auth fixtures in a database named `lh_rehearsal*`. Never load production user data into rehearsal. Never apply the bootstrap schema to live.
2. Apply additive migrations `20261001001000`, `20261001002000`, `20261001002500` with migration history in the same transaction. `20261001000000` was already applied to live to fix the duplicate signup trigger; check history before replay.
3. Validate the candidate with unit/behavior tests, the database suite, real browser checks, production build and dependency audit. Use controlled inboxes for real signup/confirmation, recovery and new-account invitation emails. Generated Auth links do not establish email-delivery evidence.
4. Deploy the compatible web commit through Dokploy, verify signup/login/invite/session behavior, then apply `20261001003000` to remove anonymous grants and enforce RLS. Confirm Core/Reports use valid service-role keys before applying this migration.
5. Verify anonymous REST and privileged RPC denial; verified same-tenant access; wrong-tenant denial; old-JWT denial after revocation; worker service-role read/write and webhook compatibility. Remove synthetic test records and session artifacts.

Do not run a blind `supabase db push`: the live migration history and local bootstrap differ. `scripts/apply-auth-migrations.mjs` verifies the target project and version/checksum, acquires an advisory lock, and atomically inserts the migration-history record. Its `additive` phase excludes the already-applied signup fix; its `security` phase runs only after the web release and acceptance gates. Never roll back by restoring anonymous grants. Keep a compatible web image/commit for rollback after RLS is enabled.

## Validation commands

```
npm test
npm run lint
npm run build
npm audit
AUTH_REHEARSAL_DATABASE_URL=<isolated-local-db> npm run test:auth-db
AUTH_TEST_BASE_URL=http://127.0.0.1:3009 npm run test:browser
```

Browser tests can use `AUTH_TEST_CHROMIUM` for an installed Chromium executable. Do not retain browser traces, screenshots, cookies or logs containing live passwords or confirmation tokens. Browser output/artifacts are gitignored.

## Verification results (2026-10-01)

- Unit/behavior suite: 76 passing; the database test is intentionally skipped when no rehearsal URL is supplied.
- Database rehearsal: 13 passing, including concurrency, RLS, revocation, disabled membership, owner-role preservation and cross-workspace permission checks.
- Chromium browser suite: seven passing against the local production build without live Auth credentials. These cover validation, destination preservation, invalid-link recovery, grant-free reset rejection and invitation entry. They do not prove SMTP delivery or a complete live provider flow.
- Production build and TypeScript passed. ESLint has no errors; the upgraded Next.js rules report eight existing navigation warnings outside the auth flow.
- Full and production npm audits report zero known vulnerabilities after the compatible updates.

## Live preparation

The first release build exhausted the 2 GB deployment host's RAM and exited with code 137; kernel logs confirmed the build process was killed. The prior production app recovered and its real-account login/API check passed. Production builds now use Webpack with a 768 MB JavaScript heap, one worker, and Webpack memory optimizations. The host has a persistent 2 GB swap fallback. This build completed locally, and TypeScript, lint and the unit suite passed again. Verify the new deployment and runtime before enabling the security migration.

Additive migrations `20261001001000`, `20261001002000`, and `20261001002500` were applied to `lhhgzyvqhhffqeaglrdp` with atomic migration history and checksum verification. The compatible web release `e455782` is deployed (Next.js 16.3.6). Migration `20261001003000` was then applied transactionally with atomic checksum/history verification. All 24 public tables now enforce row security.

A real signup was submitted through the currently deployed public form to `efren+qatest1790850778245@prismfly.com`. It created an unconfirmed account and displayed the confirmation prompt without errors. The inbox owner confirmed receipt and supplied the delivered link. The account was already confirmed when the test began, consistent with the link having been opened while copying. Reusing the delivered link did not establish a session. A subsequent live password login reached onboarding and authenticated `/api/user/info` returned the expected user. First-use delivery-link acceptance was not directly observed by the tester. This account is intentionally retained for invitation tests; its password and cookie state are held privately outside the repository.

## Remaining release evidence

A candidate production build using the real provider passed generated-link signup confirmation, authenticated API access, confirmation-token reuse rejection, password login, recovery grants, raw-password preservation, global session revocation, old-cookie rejection and destination preservation. These generated-link tests do not prove email delivery. Browser routing required a fresh navigation after canonical redirects to avoid accidentally loading the current production UI; background-request teardown required explicit cleanup of disposable fixtures.

The candidate invitation API returned 202 with `supabase_auth` delivery and pending status for a new controlled inbox alias. The inbox owner supplied the delivered invitation link. Its token verified the account, but the browser test did not complete password setup; the interrupted callback and first-use grant need a fresh-token retest.

Using a generated no-email recovery link for the invited account, password setup and fresh login passed. The target workspace had no recipient membership before explicit acceptance; clicking Accept created exactly one membership and marked the invitation accepted. The recovery token was rejected on reuse. This proves acceptance behavior, but does not replace the outstanding complete delivered-invitation setup test.

Further invitation sends are blocked by Supabase Auth: HTTP 429, `over_email_send_rate_limit`. The candidate API rolled back the invitation on delivery failure. It now reports provider throttling as HTTP 429 with a sanitized message and logs only provider code/status for diagnosis. Supabase management access is required to inspect SMTP and the effective email limit; the service-role key cannot inspect those settings.

Complete delivered-email signup/recovery/invitation flow evidence and custom SMTP remain outstanding. The deployed app and database protections have passed real-provider generated-link tests; these are distinct from email-delivery evidence. Do not describe the live email audit as complete until fresh delivered links and the production sender are verified.

## Verified live release and operations

The deployed App V2 configuration and all 15 Core/Reports applications target `lhhgzyvqhhffqeaglrdp`. The live database connection matches that project, and the retained controlled signup account is present. Project names alone were not used to choose the database. No other database was migrated or changed.

Before the security change, a private schema/grant/policy/index snapshot was saved. Supabase reported today’s managed backup as completed at 08:15:59 UTC. The applied security migration changes access rules, grants and functions; it does not delete customer rows. Audit cleanup is limited to accounts and tenant records created by the audit. No queues were cleared or failed customer jobs replayed.

Post-release checks passed: first-use generated confirmation, reuse rejection, real-provider login, recovery/password grants, global session revocation, old-cookie rejection, and destination preservation. Generated invitation setup required a fresh login; recipient membership remained absent until explicit acceptance, then exactly one membership was created. Existing-user invitations remained pending and supplied a manual link. Cross-origin cookie-authenticated mutations were rejected.

After RLS was enabled, anonymous REST and privileged RPCs were denied; same-user and same-workspace reads worked; wrong-user/wrong-workspace reads returned no rows; revoked JWTs lost direct database access. A service-role read/write probe passed inside a rolled-back transaction. Authenticated user-info, workspace, organization, member, invitation, dashboard, integration, billing and billing-plan read APIs all returned 200.

The Stripe partial indexes are valid and ready. The live release uses plain inserts plus unique-conflict recovery. A service-role transaction verified a successful insert and expected duplicate error 23505, then rolled back all probe writes. No 42P10 inference error occurred. Automatic approval review rejected a separate persistent Stripe customer-creation POST test, so it was replaced with this reversible database check; no external billing objects were created by it.

The missing `period` queue consumer was added in Dokploy on the existing worker host, with one replica and a 256 MiB memory limit. All 14 used queues now have a registered worker, and all 15 applications have valid service-role access after RLS. Core and Reports logs show job completions and no new database authorization failures. Historical failed jobs remain available for review; these counts are not evidence of current failures.

The listener’s stale Realtime connection was repaired by restarting only that service. Its subscription then succeeded, with no disconnects in the follow-up sample; polling catch-up and stable job IDs remain in place. The subsequent worker release deployed explicit service-role credential validation and disabled Auth session persistence/refresh across all 15 services. See [worker release and recovery review](./worker-release-2026-10-01.md).

Invitation password setup and explicit acceptance also passed again after RLS was enabled. The final queue sample showed a worker on every used queue, no new authorization errors, and active validation work with job completions. Listener Realtime subscription was restored and showed no disconnects in the follow-up sample. Historical failed jobs were retained.
