import { createClient } from "@supabase/supabase-js"

const email = process.argv[2]
const nextPathArg = process.argv[3]

function safeNextPath(nextPath) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard"
  }

  return nextPath
}

if (!email) {
  console.error("Usage: npm run impersonate -- <email> [next_path]")
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const appHost = (process.env.NEXT_PUBLIC_APP_HOST || "http://localhost:3000")
  .replace(/\/+$/, "")
const nextPath = safeNextPath(nextPathArg)

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const redirectTo = `${appHost}/auth/callback?next=${encodeURIComponent(nextPath)}`

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo,
  },
})

if (error) {
  console.error("Error:", error.message)
  process.exit(1)
}

console.log(`\nImpersonation link for: ${email}`)
console.log(`Redirects to: ${redirectTo}`)
console.log(`\n${data.properties.action_link}\n`)
