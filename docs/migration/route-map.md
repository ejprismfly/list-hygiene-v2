# Route Map

| Current route | v2 status | Notes |
| --- | --- | --- |
| `/login` | Implemented | Supabase email/password form. |
| `/signup` | Implemented | Supabase signup form with email confirmation redirect. |
| `/forgot-password` | Implemented | Sends Supabase password reset email. |
| `/reset-password` | Implemented | Updates password after recovery callback session. |
| `/auth/callback` | Implemented | Exchanges Supabase auth code and redirects recovery flows. |
| `/dashboard` | Native UI shell | Matches dashboard reference layout with preview data. Data migration still pending. |
| `/billing` | Native UI shell | Matches billing reference layout. Billing API wiring still pending. |
| `/billing/failed` | Native UI shell | Matches payment failed reference layout. |
| `/profile` | Native UI shell | Matches profile reference layout with account and notification sections. |
| `/settings` | Native UI shell | Matches empty integrations/settings reference layout. |
| `/settings?connected=1` | Native UI shell | Connected integration reference variant. |
| `/settings/klaviyo` | Native UI shell | Klaviyo connection configuration reference layout. |
| `/onboarding` | Native UI shell | Klaviyo onboarding reference layout. |
| `/integration-settings` | Pending alias | Decide whether this should redirect to `/settings` for compatibility. |
| `/team` | Pending | Must preserve invitations, roles, removal, and invite cancellation. |
| `/workspaces` | Pending | Must preserve create, switch, archive, and connected-account validation. |

Add new rows here before migrating a route so the replacement scope is explicit.
