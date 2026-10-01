# List Hygiene authentication email branding

These templates use the List Hygiene name, blue accent, plain product copy, accessible buttons and a short safety note. Signup and invitation copy describe email validation and healthier Klaviyo lists. No customer-facing copy names the infrastructure provider. All layout styles are inline, with table layouts and system fonts; no remote images, JavaScript or tracking pixels are required.

Preview: [all emails](./auth-email-preview.html). Subjects and template paths are in [auth-email-branding.json](./auth-email-branding.json).

| Email | Subject | Button or action |
| --- | --- | --- |
| Signup confirmation | Confirm your email for List Hygiene | Confirm email address |
| Invitation | You’re invited to a List Hygiene workspace | Set up your account |
| Password reset | Reset your List Hygiene password | Reset password |
| Email change | Confirm your email change for List Hygiene | Confirm email change |
| Reauthentication | Your List Hygiene verification code | Enter the code in the app |
| Password changed notification | Your List Hygiene password was changed | Review your account |
| Email changed notification | Your List Hygiene email address was changed | Open List Hygiene |

Sender display name: **List Hygiene**. Keep the existing verified sender email/domain when custom SMTP is already configured. If custom SMTP is absent, set it up using a verified List Hygiene sender before claiming the sender is branded or delivery is production-ready. The observed `over_email_send_rate_limit` also requires inspection of the actual SMTP and Auth send limits.

## Live application

Hosted subjects and bodies are stored in Supabase Auth, independently of the web deployment. Committing these files or deploying Next.js does not update the live email configuration.

Deploy the compatible authentication web release before publishing invitation copy that promises password setup, fresh login and explicit acceptance. Signup, invitation and recovery links preserve the app's existing `RedirectTo` and `TokenHash` contract. Email-change links use the provider's `ConfirmationURL`; reauthentication uses `Token`. Do not substitute the generic confirmation URL for the invite callback.

Preview the settings without credentials:

```sh
node scripts/auth-email-branding.mjs
```

Apply with a Supabase personal access token supplied through `SUPABASE_ACCESS_TOKEN` or the private `/root/list-hygiene/.service-access/supabase.env` file:

```sh
node scripts/auth-email-branding.mjs --apply
```

The script targets `lhhgzyvqhhffqeaglrdp`, saves a private backup of only the selected fields, patches subjects/content, then reads them back and requires an exact match. When custom SMTP is configured it also updates and verifies `smtp_sender_name`. It leaves SMTP credentials, sender address, notification enable flags, providers, security policy, redirect allowlists and email limits unchanged. Templates for security notifications and reauthentication do not enable those features. This release does not introduce passwordless sign-in.

After configuration, send new controlled-inbox signup, recovery and invitation emails. Check From name/address, subject, preview text, rendered content, first-use links and reuse rejection. Existing emails in inboxes keep their original subjects and content.

References: [email template variables and management API](https://supabase.com/docs/guides/auth/auth-email-templates), [custom SMTP and sender configuration](https://supabase.com/docs/guides/auth/auth-smtp).
