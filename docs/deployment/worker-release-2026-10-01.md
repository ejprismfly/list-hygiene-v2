# Worker release and recovery review — 2026-10-01

## Released behavior

All 15 Core/Reports services now require `SUPABASE_SERVICE_ROLE_KEY`; an anonymous key can no longer be used as a fallback. Legacy JWT credentials must identify the service role; the newer server-secret format is also accepted. Format checks are configuration checks, not cryptographic verification: live database access was separately verified for every service.

Supabase clients disable Auth session persistence and automatic token refresh. The production database remains `lhhgzyvqhhffqeaglrdp`; no database was moved or migrated by this release. There are no public API changes.

| Project | Published and deployed commit | Test coverage |
| --- | --- | --- |
| Core | `b1f6fea32307fd25fc074329cd23d471977929ed` | 21 targeted tests: credentials, listener catch-up/job identifiers, credits and error formatting |
| Reports | `629324b463cd22a521d7a6f42ef913309706eb6d` | 17 tests across the complete Reports test suite |

Reports was based on its current production main, preserving the existing `emails.updated_at` fallback. Source edits and tests were prepared in isolated worktrees; unrelated working-directory changes were preserved.

## Deployment and verification

Private application snapshots and rollback image tags were prepared before deployment. Automatic deployments were disabled temporarily. Each queue was paused while active work drained; the replacement was deployed and checked for the required credential behavior, disabled session handling, HTTP 200 database access and one queue consumer before its queue was resumed. The listener was deployed individually. All original automatic-deployment settings were restored.

Dokploy returned HTTP 200 with an empty body for the first deployment request. The response handler was corrected, the actual successful deployment was reconciled and verified, and the remaining rollout completed sequentially. No customer jobs were cleared or manually retried.

The non-email live regression checks passed:

- Generated signup verification, verification-token reuse rejection, password login and authenticated APIs.
- Password recovery grants, raw-password preservation, fresh login and global session revocation; old cookies/JWTs lost access.
- Invitation password setup, fresh login and explicit acceptance; exactly one target membership was created only after acceptance. Existing-user invitations stayed pending and returned a manual link. Cross-origin mutations were rejected.
- Same-user/workspace access, cross-tenant denial, privileged RPC denial and RLS on all 24 public tables.
- User, workspace, organization, member, invitation, dashboard, integration, billing and plan read APIs returned 200 for the retained controlled audit account.
- Billing mapping insertion/unique-conflict recovery and duplicate-credit protection passed using synthetic rows inside rolled-back transactions. The credit RPC deducted once for a repeated idempotency key. No Stripe objects were created or persistent customer balances changed.

Three new report jobs belonging to a disposable audit account were processed by the deployed Historical, Monthly Usage and Breakdown workers. They produced the expected tenant-scoped historical/monthly/breakdown/current report rows. Only those audit jobs and their disposable account/report/tenant records were removed afterward. No email, validation-provider or billing operation was performed by that test.

The final observation window ran from 19:24:20 to 19:29:28 UTC. All 15 services remained running, all 14 queues had one consumer and every queue was resumed. No new logged errors or database authorization errors were observed. Core Trigger and Report Scanner each completed five scheduled jobs; the sampled queue streams showed 98 completed events in total. The listener was subscribed with zero disconnects since its replacement started.

Exact before/after job-ID comparisons confirmed that all 2,104 historical failures and all 38 future non-cron delayed jobs were preserved. The two repeating cron jobs continued their normal scheduling cycle. Deployment status and restored automatic-deployment flags were also checked independently for all 15 applications.

## Historical recovery review

The read-only audit captured 2,104 retained failures and 40 delayed jobs across 14 queues. Historical failure counts are not counts of new release failures. Individual job references and current record/billing state are stored privately outside the repository; no customer emails, identifiers, credentials or job payloads are committed here.

| Queue | Retained failures | Findings |
| --- | ---: | --- |
| Trigger | 100 | Old `logger.warning` error; the current source already uses `logger.warn`. |
| Scan | 471 | 352 provider/network failures, 76 missing provider resources, 27 integration lookup failures and 16 rejected provider requests. 74 referenced integrations no longer exist. |
| Validate | 500 | 482 failed for insufficient credits; 479 still have no available credits and three already show subsequent processing. Other failures involved missing billing, integration or email records. |
| Confirm | 4 | Provider request/integration errors; one record shows subsequent processing. |
| Period | 0 | Missing consumer was repaired earlier; consumer remains present. |
| Charge | 3 | Historical billing-mapping failures requiring reconciliation before any charge retry. |
| Fix typo | 2 | Provider request/conflict errors requiring review. |
| Suppress | 173 | Provider returned 404. This does not independently prove deletion; provider access/resource state needs review before retrying. |
| Bulk validate | 7 | Three records show subsequent processing; four source rows no longer exist. Seven separate future retries remain scheduled. |
| Bulk counter | 0 | No retained failures. |
| Report scanner | 88 | Historical provider/network errors. |
| Historical report | 337 | 61 old schema/index failures, 272 old query errors without adequate detail, and four other errors. |
| Monthly usage | 327 | 315 old query errors without adequate detail and 12 provider/network failures. |
| Breakdown | 92 | 86 old query errors without adequate detail and six provider/network failures. |

The recovery review identifies 683 report failures referencing current user profiles, 19 referencing current workspaces and 54 whose user profiles no longer exist. Existing report rows may already supersede historical failed jobs; these counts do not establish that reports are currently missing.

Per the selected scope, no historical jobs were replayed or removed. Recovery requires a separate review of current provider state, available credits, existing results and duplicate protection. Do not bulk retry validation, suppression or charge jobs. The existing report/index fixes and corrected logging are retained; historical jobs remain available for review.

## Remaining boundary

Custom SMTP and complete fresh delivered-email signup/recovery/invitation tests remain pending. Generated links prove authentication behavior but not email transport. Paid provider operations, purchases and subscription changes were not tested against real customers. Final operational monitoring results are recorded in the release status artifact.
