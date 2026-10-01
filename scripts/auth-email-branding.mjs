import { readFileSync, writeFileSync } from 'node:fs'

const manifestUrl = new URL('../docs/deployment/auth-email-branding.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))
if (manifest.projectRef !== 'lhhgzyvqhhffqeaglrdp') throw new Error('Unexpected production project')

const payload = {}
for (const template of manifest.templates) {
  payload[`mailer_subjects_${template.key}`] = template.subject
  payload[`mailer_templates_${template.key}_content`] = readFileSync(new URL(template.file, manifestUrl), 'utf8')
}
console.log(JSON.stringify({ projectRef: manifest.projectRef, subjects: manifest.templates.map(({ subject }) => subject), senderName: manifest.senderName }, null, 2))
if (!process.argv.includes('--apply')) {
  console.log('Preview only. Use --apply with Supabase management access to update hosted templates.')
  process.exit(0)
}

let token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  const flag = process.argv.indexOf('--token-file')
  const path = flag === -1 ? new URL('../../.service-access/supabase.env', import.meta.url) : process.argv[flag + 1]
  try {
    const contents = readFileSync(path, 'utf8')
    token = contents.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)\s*$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
  } catch {}
}
if (!token || /[\r\n]/.test(token)) throw new Error('Supabase management access is missing; keep credentials outside the repository')

const endpoint = `https://api.supabase.com/v1/projects/${manifest.projectRef}/config/auth`
async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Auth configuration ${method} failed (HTTP ${response.status})`)
  return response.json()
}

const before = await request('GET')
const customSmtp = Boolean(before.smtp_host && before.smtp_admin_email)
if (customSmtp) payload.smtp_sender_name = manifest.senderName
const backupPath = `/tmp/lh-auth-email-branding-backup-${Date.now()}.json`
const backup = Object.fromEntries(Object.keys(payload).map(key => [key, before[key] ?? null]))
writeFileSync(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' })
await request('PATCH', payload)
const after = await request('GET')
for (const [key, value] of Object.entries(payload)) {
  if (after[key] !== value) throw new Error(`Auth configuration verification failed for ${key}; backup saved at ${backupPath}`)
}
console.log(JSON.stringify({ updatedAndVerified: Object.keys(payload), customSmtp, emailSendLimit: after.rate_limit_email_sent, backupPath }))
if (!customSmtp) console.log('Subjects and content updated. Custom SMTP is still required to replace the default Supabase sender.')
