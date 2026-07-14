import { Pool, type QueryResultRow } from "pg"

let pool: Pool | null = null

function databaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    null
  )
}

export function isDirectDatabaseConfigured() {
  return Boolean(databaseUrl())
}

function getPool() {
  const connectionString = databaseUrl()
  if (!connectionString) {
    throw new Error("DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL is required.")
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    })
  }

  return pool
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const result = await getPool().query<T>(text, values)
  return result.rows
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const [row] = await queryRows<T>(text, values)
  return row || null
}
