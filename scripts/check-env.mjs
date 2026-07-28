import fs from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

const { Client } = pg
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName)
  if (!fs.existsSync(filePath)) {
    return
  }

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) {
      continue
    }

    const [, key, rawValue] = match
    if (process.env[key] !== undefined) {
      continue
    }

    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function requireEnv(key) {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is required.`)
  }
  return value
}

function optionalEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) {
      return { key, value }
    }
  }
  throw new Error(`${keys.join(" or ")} is required.`)
}

function projectRefFromSupabaseUrl(url) {
  return new URL(url).hostname.split(".")[0]
}

function databaseUrlMatchesRef(databaseUrl, projectRef) {
  const parsed = new URL(databaseUrl)
  const username = decodeURIComponent(parsed.username)

  return parsed.hostname.includes(projectRef) || username.includes(projectRef)
}

function masked(value) {
  if (value.length <= 12) {
    return "***"
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

async function checkFetch(name, url, key) {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: {
      apikey: key,
    },
  })

  if (!response.ok) {
    throw new Error(`${name} request failed with HTTP ${response.status}.`)
  }
}

function printPass(label, value = "") {
  console.log(`OK   ${label}${value ? `: ${value}` : ""}`)
}

function printInfo(label, value = "") {
  console.log(`INFO ${label}${value ? `: ${value}` : ""}`)
}

loadEnvFile(".env")
loadEnvFile(".env.local")

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
const publishable = optionalEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const database = optionalEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL")
const expectedRef = process.env.EXPECTED_SUPABASE_REF?.trim()
const projectRef = projectRefFromSupabaseUrl(supabaseUrl)

printInfo("Supabase project", projectRef)
printInfo(publishable.key, masked(publishable.value))
printInfo("SUPABASE_SERVICE_ROLE_KEY", masked(serviceRoleKey))
printInfo(database.key, new URL(database.value).host)

if (expectedRef && projectRef !== expectedRef) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL points to ${projectRef}, expected ${expectedRef}.`
  )
}
printPass("Supabase URL project ref")

if (!databaseUrlMatchesRef(database.value, projectRef)) {
  throw new Error(`${database.key} does not appear to point to ${projectRef}.`)
}
printPass("Database URL project ref")

await checkFetch("Supabase publishable key", supabaseUrl, publishable.value)
printPass("Supabase publishable key")

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
const { data: adminUsers, error: adminError } =
  await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 })
if (adminError) {
  throw adminError
}
printPass("Supabase service role", `${adminUsers.users.length} sample user(s)`)

const db = new Client({
  connectionString: database.value,
  ssl: database.value.includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
})

try {
  await db.connect()
  const version = await db.query(
    "select current_database() as database, current_user as user, current_setting('server_version') as version"
  )
  printPass(
    "Database connection",
    `${version.rows[0].user}@${version.rows[0].database} PostgreSQL ${version.rows[0].version}`
  )

  const counts = await db.query(`
    select
      (select count(*)::int from auth.users) as users,
      (select count(*)::int from public.workspaces) as workspaces,
      (select count(*)::int from public.workspace_members) as workspace_members,
      (select count(*)::int from public.klaviyo_accounts) as klaviyo_accounts,
      (select count(*)::int from public.stripe_accounts) as stripe_accounts,
      (select count(*)::int from public.emails) as emails
  `)
  printPass("Core table counts", JSON.stringify(counts.rows[0]))

  const workspaceOwners = await db.query(`
    with workspace_owner_counts as (
      select
        w.id,
        count(wm.id) filter (where wm.role = 'owner') as owner_count
      from public.workspaces w
      left join public.workspace_members wm on wm.workspace_id = w.id
      where w.archived_at is null
      group by w.id
    )
    select
      count(*)::int as active_workspaces,
      count(*) filter (where owner_count = 0)::int as without_owner,
      count(*) filter (where owner_count > 1)::int as multiple_owners
    from workspace_owner_counts
  `)
  const ownerCounts = workspaceOwners.rows[0]
  if (ownerCounts.without_owner || ownerCounts.multiple_owners) {
    throw new Error(
      `Workspace owner check failed: ${JSON.stringify(ownerCounts)}`
    )
  }
  printPass("Workspace owner integrity", JSON.stringify(ownerCounts))
} finally {
  await db.end()
}

console.log("OK   Env check completed.")
