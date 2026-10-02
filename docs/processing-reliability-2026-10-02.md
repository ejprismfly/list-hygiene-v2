# Processing reliability release

The production target is `lhhgzyvqhhffqeaglrdp`, verified from the running List Hygiene Docker services. No database is moved. UI and authentication email designs are preserved. SMTP credentials remain a separate configuration issue.

## Changes

- Reports read all source rows through ordered keyset pagination. Historical and current-month snapshots commit together. Monthly and breakdown replacements also use database transactions. Workspace uniqueness replaces legacy user-only primary keys without discarding rows.
- Email writes record durable report generations. A refresh acknowledges only the generation it read, leaving concurrent changes pending. Month rollover also requests a new generation. Scheduler deduplication ends when a job completes or fails; failed jobs remain available for review.
- Billing claims use fenced processing leases. Invoice credits, history and invoice effects commit under the account lock. Invoice effects preserve an unfinished replacement-subscription cancellation across retries. Cancellations match both customer and current subscription. Older invoices cannot overwrite a newer billing period or invoice timestamp.
- Bulk completion counts immutable source profile identities. Provider merges may change the destination ID without changing the paid snapshot. All eight reports commit as one versioned bundle. A durable refresh record recovers counter/report failures. Explicit CLI regeneration requests a fresh version.
- Scans include accounts without segment lists, validate selected segments, check integration activity and persist a per-scope successful checkpoint after all profile pages are stored. The five-minute overlap is bounded by this release's cutoff. Pre-release gaps are not automatically replayed. Realtime listener catch-up also uses the release cutoff, while existing queued work is retained.
- Worker writes reject database errors; provider errors classify authentication, missing resources and transient failures. Workers close active jobs on shutdown. Queue failures are retained.
- Routine worker tests run each unit file in a fresh process. Provider integration tests require explicitly configured disposable fixtures, and the destructive seed refuses a remote database. Provider credentials are supplied through environment variables rather than committed test constants.

## Guarded migrations

Apply only the explicit phase required for the current rollout stage:

```sh
EXPECTED_SUPABASE_REF=lhhgzyvqhhffqeaglrdp node scripts/apply-auth-migrations.mjs reports
EXPECTED_SUPABASE_REF=lhhgzyvqhhffqeaglrdp node scripts/apply-auth-migrations.mjs billing
EXPECTED_SUPABASE_REF=lhhgzyvqhhffqeaglrdp node scripts/apply-auth-migrations.mjs processing
```

`PROCESSING_RELEASE_CUTOFF` records when core queues were paused for replacement, so profiles created during rollout are recovered. It must be within the preceding hour.

`DATABASE_URL` comes from private service configuration. The runner verifies the project, holds a migration lock, records checksums, and rolls back an unsuccessful phase. Do not run the historical bootstrap migrations against production.

## Verification

`node scripts/verify-processing-migrations.mjs` requires `PROCESSING_TEST_DATABASE_URL` on localhost and an `isolated_processing_fixture` marker. The fixture in `scripts/fixtures/processing-schema.sql` reproduces production columns, primary keys, checks and indexes without customer records or foreign-key dependencies. Its serial field is represented as an identity column. Apply the three new migrations to that disposable database before running the verification script.

The verification covers workspace isolation, report rollback, concurrent refreshes, simultaneous webhook claims, account-lock contention, credit/history rollback, invoice replay, renewal history, late invoice protection, old-subscription deletion, scan checkpoints, distinct bulk counts and report bundle idempotency. Unit tests additionally cover source pagination beyond 1,000 rows and failed provider/persistence pages.

## Rollout and recovery

Back up database data/schema, service configuration, images, Redis data and job states privately. Freeze automatic deployments, drain affected queues, then deploy reports, web billing and core workers in order. Preserve original automatic-deployment settings. Recalculate active report scopes and the two overcounted bulk jobs; retain invoice snapshots and historical completion timestamps.

Redis uses the existing service, password, volume, databases and running image digest. Enable AOF with `appendfsync always`, retain the existing RDB schedule and `noeviction`, and wait for the initial rewrite before restarting. Persist the command in Dokploy. Stop producers/consumers for the final backup/restart, restore the backup into an isolated Redis with no customer workers, compare job states, then resume production. See [Redis persistence documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) and [Dokploy Redis API](https://docs.dokploy.com/docs/api/redis).

Rollback uses saved images and settings. Keep additive schema and customer data in place; never restore an old database backup over subsequent customer activity. Preserve queued and failed jobs. Historical validation gaps, ambiguous provider operations and questionable billing balances remain in the private recovery review, without automatic financial or provider changes.

A read-only investigation of the recent suppression 404 found that the stored Klaviyo profile no longer exists, while an email lookup finds a different profile ID. That failed job requires review before correcting the destination and retrying it.
