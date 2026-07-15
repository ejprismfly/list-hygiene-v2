# Route Map

| Current route | v2 status | Notes |
| --- | --- | --- |
| `/login` | Implemented | Supabase email/password form. |
| `/signup` | Implemented | Supabase signup form with email confirmation redirect. |
| `/forgot-password` | Implemented | Sends Supabase password reset email. |
| `/reset-password` | Implemented | Updates password after recovery callback session. |
| `/auth/callback` | Implemented | Exchanges Supabase auth code and redirects recovery flows. |
| `/dashboard` | Implemented | Native dashboard with workspace-scoped API data and demo-data toggle for preview/testing. |
| `/billing` | Implemented | Native billing UI with workspace-scoped billing API context. Stripe webhooks still stay on v1 during side-by-side testing. |
| `/billing/failed` | Implemented | Matches payment failed reference layout. |
| `/billing-failed` | Compatibility alias | Redirects to `/billing/failed`. |
| `/billing-successful` | Compatibility alias | Redirects to `/billing`. |
| `/profile` | Native UI shell | Matches profile reference layout with account and notification sections. |
| `/settings` | Native UI shell | Matches empty integrations/settings reference layout. |
| `/settings?connected=1` | Native UI shell | Connected integration reference variant. |
| `/settings/klaviyo` | Native UI shell | Klaviyo connection configuration reference layout. |
| `/onboarding` | Native UI shell | Klaviyo onboarding reference layout. |
| `/integration-settings` | Compatibility alias | Redirects to `/settings`. |
| `/team` | Modal flow | Invitations, roles, removal, and invite cancellation live in the workspace manager modal. Dedicated route still optional. |
| `/workspaces` | Modal flow | Create, switch, rename, archive/delete, connected-account validation, and forced-create flow live in the sidebar/mobile workspace manager. Dedicated route still optional. |

Add new rows here before migrating a route so the replacement scope is explicit.
