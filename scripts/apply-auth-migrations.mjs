import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const phase = process.argv[2]
const expectedRef = process.env.EXPECTED_SUPABASE_REF
const connectionString = process.env.DATABASE_URL
if (!['additive', 'security', 'reports', 'billing', 'processing'].includes(phase) || !expectedRef || !connectionString) {
  throw new Error('Usage: EXPECTED_SUPABASE_REF=<project> DATABASE_URL=<private-env> node scripts/apply-auth-migrations.mjs additive|security|reports|billing|processing')
}
const url = new URL(connectionString)
if (!(url.hostname + decodeURIComponent(url.username)).includes(expectedRef)) {
  throw new Error('Database connection does not match the expected Supabase project')
}
const files = phase === 'processing' ? ['20261002003000_processing_checkpoints.sql'] : phase === 'billing' ? ['20261002002000_atomic_billing_events.sql'] : phase === 'reports' ? ['20261002001000_durable_report_snapshots.sql', '20261002001100_preserve_report_periods.sql'] : phase === 'additive' ? [
  '20261001001000_authentication_primitives.sql',
  '20261001002000_atomic_invitation_acceptance.sql',
  '20261001002500_atomic_member_permissions.sql',
] : ['20261001003000_restore_authenticated_tenant_security.sql']
const digest = sql => createHash('sha256').update(sql.trim()).digest('hex')
const client = new pg.Client({ connectionString, ssl: url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? undefined : { rejectUnauthorized: false } })
try {
  await client.connect()
  for (const filename of files) {
    const [version] = filename.split('_')
    const sql = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
      .replace(/^begin;\s*/i, '').replace(/\s*commit;\s*$/i, '').trim()
    await client.query('begin')
    try {
      await client.query("select pg_advisory_xact_lock(hashtext('list-hygiene-auth-migrations'))")
      const existing = await client.query('select statements from supabase_migrations.schema_migrations where version=$1', [version])
      if (existing.rowCount) {
        if (digest((existing.rows[0].statements || []).join('\n')) !== digest(sql)) throw new Error(`Migration ${version} already exists with different content`)
        await client.query('commit')
        console.log(`Already applied ${version}`)
        continue
      }
      if (phase === 'processing') {
        const cutoff = process.env.PROCESSING_RELEASE_CUTOFF
        const age = Date.now() - new Date(cutoff || '').getTime()
        if (!cutoff || !Number.isFinite(age) || age < 0 || age > 3600000) throw new Error('A recent processing queue-pause cutoff is required')
        await client.query("select set_config('list_hygiene.processing_release_cutoff',$1,true)", [cutoff])
      }
      await client.query(sql)
      const name = filename.slice(version.length + 1, -4)
      await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [sql], name])
      await client.query('commit')
      console.log(`Applied ${version}`)
    } catch (error) {
      await client.query('rollback')
      // Never print connection strings, provider details or credentials.
      throw new Error(`Migration ${version} failed: ${error.code || 'migration_conflict'}`)
    }
  }
  await client.query("notify pgrst, 'reload schema'")
} finally { await client.end() }
