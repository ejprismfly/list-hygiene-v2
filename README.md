# List Hygiene v2

Native Next.js and shadcn UI scaffold for the next List Hygiene frontend.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Only placeholder environment names are committed. Do not copy production secrets into this project.

## Implemented Routes

- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/auth/callback`
- `/dashboard`
- `/billing`
- `/billing/failed`
- `/profile`
- `/settings`
- `/settings?connected=1`
- `/settings/klaviyo`
- `/onboarding`

The dashboard is protected and remains dynamic so it reads runtime auth state.
When Supabase envs are not configured, app routes render preview data for local UI review.

## Verification

```bash
npm run lint
npm run build
```

Migration notes live in `docs/migration`.
