# List Hygiene authentication email branding

These templates preserve the original hosted email design: centered white cards, black buttons, Arial typography, original spacing and colors. The two security notification templates retain their original plain layout. Subjects and wording describe List Hygiene, email validation and healthier Klaviyo lists. No customer-facing copy names the infrastructure provider. The original stylesheet is preserved; no remote images, JavaScript or tracking pixels are required.

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

## Live status (2026-10-01)

All seven subjects and HTML bodies were patched on the verified live project `lhhgzyvqhhffqeaglrdp` and read back with exact-match verification after the compatible web release. The current transport remains Supabase’s built-in sender, with a two-email/hour cap. Reliable public delivery and the approved sender `auth@mail.listhygiene.com` still require the actual Mailgun SMTP password.

Supabase configuration reads return a secret fingerprint rather than a reusable SMTP password. Do not copy that value into another project. The attempted sender reuse was reverted and the built-in transport and original stored cap verified. An empty private `SMTP_PASSWORD` field is prepared in `/root/list-hygiene/.service-access/smtp.env`; credentials must remain outside the repository.

The existing workspace configurations, Dokploy project/environment/application settings and compose definition contain no Mailgun or SMTP credential. Read-only checks of the older List Hygiene production project found no Mailgun/SMTP Vault entries, relevant Edge Function secrets, or email functions. No Mailgun plugin was available in the plugin directory. Mailgun account/API access or the saved SMTP password is required to complete the production sender setup.

The earlier blue redesign was removed at the user’s request. Original styles were recovered from the private pre-change live backup and kept verbatim; signup/invitation/recovery link contracts remain compatible with the deployed auth release.

The inbox owner confirmed receipt of the fresh branded signup email at the authorized audit alias. First-use acceptance of that delivered link was not directly observed. The restored original layout passed browser checks at 375 and 760 pixels with black buttons and no horizontal overflow; all seven hosted subject/template fields were verified again.
