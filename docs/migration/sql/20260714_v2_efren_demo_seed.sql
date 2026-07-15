-- Dev/test seed only.
--
-- Do not run this against the current v1/live database. Some current live
-- report summary tables intentionally do not have id columns, while this
-- greenfield seed targets the v2 dev schema.

begin;

do $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_main_workspace_id uuid;
  v_test_workspace_id uuid;
  v_klaviyo_account_id uuid := '99dd8e25-7afd-4369-8c0e-0720ed8f64aa';
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = 'efren@prismfly.com'
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user efren@prismfly.com does not exist.';
  end if;

  select om.organization_id
    into v_org_id
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = v_user_id
    and om.status = 'active'
  order by om.created_at asc, o.created_at asc
  limit 1;

  if v_org_id is null then
    insert into public.organizations (
      id,
      name,
      slug,
      owner_user_id,
      legacy_user_id
    )
    values (
      '58e7700c-e54a-432d-b6f8-174a6ef0f12f',
      'Prismfly',
      'prismfly-demo',
      v_user_id,
      v_user_id
    )
    on conflict (legacy_user_id) do update
      set name = excluded.name,
          owner_user_id = excluded.owner_user_id,
          updated_at = now()
    returning id into v_org_id;
  end if;

  update public.organizations
    set name = 'Prismfly',
        owner_user_id = v_user_id,
        updated_at = now()
  where id = v_org_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_by_user_id
  )
  values (
    v_org_id,
    v_user_id,
    'owner',
    'active',
    v_user_id
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = now();

  update public.organization_members
    set status = 'disabled',
        updated_at = now()
  where user_id = v_user_id
    and organization_id <> v_org_id
    and status = 'active';

  select id
    into v_main_workspace_id
  from public.workspaces
  where organization_id = v_org_id
    and archived_at is null
  order by is_default desc, created_at asc
  limit 1;

  if v_main_workspace_id is null then
    insert into public.workspaces (
      id,
      organization_id,
      name,
      slug,
      created_by_user_id,
      legacy_user_id,
      is_default,
      archived_at
    )
    values (
      '8a1b3b27-fd47-4f8e-b4eb-37d47b32d824',
      v_org_id,
      'Prismfly Main',
      'default',
      v_user_id,
      v_user_id,
      true,
      null
    )
    returning id into v_main_workspace_id;
  end if;

  update public.workspaces
    set name = 'Prismfly Main',
        is_default = true,
        archived_at = null,
        updated_at = now()
  where id = v_main_workspace_id;

  update public.workspaces
    set is_default = false,
        updated_at = now()
  where organization_id = v_org_id
    and id <> v_main_workspace_id
    and is_default = true;

  insert into public.workspaces (
    id,
    organization_id,
    name,
    slug,
    created_by_user_id,
    legacy_user_id,
    is_default,
    archived_at
  )
  values (
    'd8cd089f-c8d3-48ea-b1cd-4e961044c001',
    v_org_id,
    'Campaign Testing',
    'campaign-testing',
    v_user_id,
    null,
    false,
    null
  )
  on conflict (organization_id, slug) where slug is not null do update
    set name = excluded.name,
        archived_at = null,
        updated_at = now()
  returning id into v_test_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    organization_id,
    user_id,
    role
  )
  values
    (v_main_workspace_id, v_org_id, v_user_id, 'owner'),
    (v_test_workspace_id, v_org_id, v_user_id, 'admin')
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        updated_at = now();

  insert into public.klaviyo_accounts (
    id,
    user_id,
    organization_id,
    workspace_id,
    created_by_user_id,
    billing_user_id,
    platform,
    connection_name,
    external_account_id,
    access_token,
    refresh_token,
    token_scope,
    account_details,
    segments,
    selected_segment,
    fix_typos,
    full_mailbox_retries,
    greylisted_retries,
    unexpected_error_retries,
    mail_server_temporary_error_retries,
    active,
    connected_at
  )
  values (
    v_klaviyo_account_id,
    v_user_id,
    v_org_id,
    v_main_workspace_id,
    v_user_id,
    v_user_id,
    'klaviyo',
    'Prismfly Development1',
    'demo-klaviyo-prismfly',
    'demo-access-token',
    'demo-refresh-token',
    'accounts:read profiles:read segments:read',
    '[{"id":"demo-klaviyo-prismfly","attributes":{"name":"Prismfly Demo Account"}}]'::jsonb,
    '[{"id":"SEG_DEMO_RECENT_BUYERS","attributes":{"name":"Recent Buyers","created":"2026-06-01T00:00:00Z"}},{"id":"SEG_DEMO_NEWSLETTER","attributes":{"name":"Newsletter Subscribers","created":"2026-05-01T00:00:00Z"}}]'::jsonb,
    '{"id":"SEG_DEMO_NEWSLETTER","attributes":{"name":"Newsletter Subscribers","created":"2026-05-01T00:00:00Z"}}'::jsonb,
    true,
    2,
    1,
    1,
    1,
    true,
    '2026-03-09 00:00:00+00'
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        connection_name = excluded.connection_name,
        account_details = excluded.account_details,
        segments = excluded.segments,
        selected_segment = excluded.selected_segment,
        fix_typos = excluded.fix_typos,
        full_mailbox_retries = excluded.full_mailbox_retries,
        greylisted_retries = excluded.greylisted_retries,
        unexpected_error_retries = excluded.unexpected_error_retries,
        mail_server_temporary_error_retries = excluded.mail_server_temporary_error_retries,
        active = excluded.active,
        updated_at = now();

  insert into public.stripe_accounts (
    id,
    user_id,
    organization_id,
    workspace_id,
    billing_scope,
    customer_id,
    subscription_id,
    plan_id,
    credits_plan,
    credits_remaining,
    credits_used,
    credits_turnover,
    reset_date,
    overage_plan,
    overage_remaining,
    overage_used,
    trial_plan,
    trial_remaining,
    trial_used,
    trial_redeemed_with,
    active
  )
  values (
    '2c74c544-62ad-4f6b-8bb2-3d35a9f16d52',
    v_user_id,
    v_org_id,
    v_main_workspace_id,
    'workspace',
    'cus_demo_efren_prismfly',
    'sub_demo_efren_prismfly',
    'trial',
    300,
    297,
    3,
    0,
    '2026-08-01 00:00:00+00',
    0,
    0,
    0,
    300,
    297,
    3,
    v_klaviyo_account_id,
    true
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        billing_scope = excluded.billing_scope,
        customer_id = excluded.customer_id,
        subscription_id = excluded.subscription_id,
        plan_id = excluded.plan_id,
        credits_plan = excluded.credits_plan,
        credits_remaining = excluded.credits_remaining,
        credits_used = excluded.credits_used,
        credits_turnover = excluded.credits_turnover,
        reset_date = excluded.reset_date,
        overage_plan = excluded.overage_plan,
        overage_remaining = excluded.overage_remaining,
        overage_used = excluded.overage_used,
        trial_plan = excluded.trial_plan,
        trial_remaining = excluded.trial_remaining,
        trial_used = excluded.trial_used,
        trial_redeemed_with = excluded.trial_redeemed_with,
        active = excluded.active,
        updated_at = now();

  insert into public.stripe_payment_methods (
    id,
    user_id,
    organization_id,
    workspace_id,
    billing_scope,
    customer_id,
    payment_method_id,
    payment_id,
    brand,
    last4,
    exp_month,
    exp_year,
    is_default
  )
  values (
    'e2ca0ed9-7f53-404b-978b-eccf205e0de6',
    v_user_id,
    v_org_id,
    v_main_workspace_id,
    'workspace',
    'cus_demo_efren_prismfly',
    'pm_demo_efren_prismfly',
    'pm_demo_efren_prismfly',
    'visa',
    '4242',
    12,
    2030,
    true
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        customer_id = excluded.customer_id,
        payment_id = excluded.payment_id,
        brand = excluded.brand,
        last4 = excluded.last4,
        exp_month = excluded.exp_month,
        exp_year = excluded.exp_year,
        is_default = excluded.is_default,
        updated_at = now();

  insert into public.email_report_tbl (
    id,
    user_id,
    organization_id,
    workspace_id,
    total_count,
    valid_count,
    invalid_count,
    risky_count,
    restricted_count,
    suppressed_count
  )
  values (
    '401b6e48-7ffb-4041-8b49-40d2f23f6fb5',
    v_user_id,
    v_org_id,
    v_main_workspace_id,
    12420,
    8290,
    1420,
    1810,
    900,
    1640
  )
  on conflict (id) do update
    set user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        total_count = excluded.total_count,
        valid_count = excluded.valid_count,
        invalid_count = excluded.invalid_count,
        risky_count = excluded.risky_count,
        restricted_count = excluded.restricted_count,
        suppressed_count = excluded.suppressed_count,
        updated_at = now();

  insert into public.email_usage_monthly (
    id,
    month_start,
    user_id,
    organization_id,
    workspace_id,
    valid_count,
    invalid_count,
    risky_count,
    restricted_count,
    suppressed_count,
    sort_idx
  )
  values
    ('75fe8fd5-b3d1-4f52-b673-7593e870a001', '2026-02-01', v_user_id, v_org_id, v_main_workspace_id, 4200, 520, 730, 220, 610, 1),
    ('75fe8fd5-b3d1-4f52-b673-7593e870a002', '2026-03-01', v_user_id, v_org_id, v_main_workspace_id, 5100, 710, 880, 340, 820, 2),
    ('75fe8fd5-b3d1-4f52-b673-7593e870a003', '2026-04-01', v_user_id, v_org_id, v_main_workspace_id, 6200, 940, 1010, 510, 1040, 3),
    ('75fe8fd5-b3d1-4f52-b673-7593e870a004', '2026-05-01', v_user_id, v_org_id, v_main_workspace_id, 7600, 1180, 1320, 680, 1360, 4),
    ('75fe8fd5-b3d1-4f52-b673-7593e870a005', '2026-06-01', v_user_id, v_org_id, v_main_workspace_id, 8010, 1300, 1610, 790, 1510, 5),
    ('75fe8fd5-b3d1-4f52-b673-7593e870a006', '2026-07-01', v_user_id, v_org_id, v_main_workspace_id, 8290, 1420, 1810, 900, 1640, 6)
  on conflict (id) do update
    set month_start = excluded.month_start,
        user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        valid_count = excluded.valid_count,
        invalid_count = excluded.invalid_count,
        risky_count = excluded.risky_count,
        restricted_count = excluded.restricted_count,
        suppressed_count = excluded.suppressed_count,
        sort_idx = excluded.sort_idx,
        updated_at = now();

  insert into public.email_usage_breakdown_monthly (
    id,
    month_start,
    user_id,
    organization_id,
    workspace_id,
    metric,
    key,
    count,
    sort_idx,
    color_hex
  )
  values
    ('046e12e1-17ac-43d2-ad02-d2bd678e0001', '2026-07-01', v_user_id, v_org_id, v_main_workspace_id, 'status', 'valid', 8290, 1, '#111111'),
    ('046e12e1-17ac-43d2-ad02-d2bd678e0002', '2026-07-01', v_user_id, v_org_id, v_main_workspace_id, 'status', 'invalid', 1420, 2, '#737373'),
    ('046e12e1-17ac-43d2-ad02-d2bd678e0003', '2026-07-01', v_user_id, v_org_id, v_main_workspace_id, 'status', 'risky', 1810, 3, '#a3a3a3'),
    ('046e12e1-17ac-43d2-ad02-d2bd678e0004', '2026-07-01', v_user_id, v_org_id, v_main_workspace_id, 'status', 'restricted', 900, 4, '#d4d4d4')
  on conflict (id) do update
    set month_start = excluded.month_start,
        user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        metric = excluded.metric,
        key = excluded.key,
        count = excluded.count,
        sort_idx = excluded.sort_idx,
        color_hex = excluded.color_hex,
        updated_at = now();

  insert into public.emails_historical_performance (
    id,
    user_id,
    organization_id,
    workspace_id,
    order_id,
    month,
    year,
    key,
    start,
    "end",
    valid,
    invalid,
    risky,
    restricted
  )
  values
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090001', v_user_id, v_org_id, v_main_workspace_id, 1, 'Feb', 2026, '2026-02', '2026-02-01', '2026-02-28', 4200, 520, 730, 220),
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090002', v_user_id, v_org_id, v_main_workspace_id, 2, 'Mar', 2026, '2026-03', '2026-03-01', '2026-03-31', 5100, 710, 880, 340),
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090003', v_user_id, v_org_id, v_main_workspace_id, 3, 'Apr', 2026, '2026-04', '2026-04-01', '2026-04-30', 6200, 940, 1010, 510),
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090004', v_user_id, v_org_id, v_main_workspace_id, 4, 'May', 2026, '2026-05', '2026-05-01', '2026-05-31', 7600, 1180, 1320, 680),
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090005', v_user_id, v_org_id, v_main_workspace_id, 5, 'Jun', 2026, '2026-06', '2026-06-01', '2026-06-30', 8010, 1300, 1610, 790),
    ('1ed9dbcb-3d3a-45e5-b39d-c09095090006', v_user_id, v_org_id, v_main_workspace_id, 6, 'Jul', 2026, '2026-07', '2026-07-01', '2026-07-31', 8290, 1420, 1810, 900)
  on conflict (id) do update
    set user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        order_id = excluded.order_id,
        month = excluded.month,
        year = excluded.year,
        key = excluded.key,
        start = excluded.start,
        "end" = excluded."end",
        valid = excluded.valid,
        invalid = excluded.invalid,
        risky = excluded.risky,
        restricted = excluded.restricted,
        updated_at = now();

  insert into public.emails (
    id,
    user_id,
    organization_id,
    workspace_id,
    klaviyo_account_id,
    email,
    status,
    substatus,
    lh_status,
    lh_category,
    tagged,
    suppress,
    checked_at,
    created_at
  )
  values
    ('46925a6d-7306-4ac9-8121-bdf03c010001', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.customer@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '1 day'),
    ('46925a6d-7306-4ac9-8121-bdf03c010002', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'bad.customer@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now(), now() - interval '1 day'),
    ('46925a6d-7306-4ac9-8121-bdf03c010003', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'risky.customer@example.com', 'risky', 'accept_all', 'risky', 'risky', true, true, now(), now() - interval '1 day'),
    ('46925a6d-7306-4ac9-8121-bdf03c010004', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'restricted.customer@example.com', 'restricted', 'role_based', 'restricted', 'restricted', true, true, now(), now() - interval '1 day'),
    ('46925a6d-7306-4ac9-8121-bdf03c010005', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.one@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '2 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010006', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.two@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '2 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010007', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.three@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '2 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010008', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.four@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '3 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010009', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.five@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '3 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010010', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'invalid.one@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now(), now() - interval '3 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010011', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'invalid.two@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now(), now() - interval '4 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010012', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'invalid.three@example.com', 'invalid', 'invalid_domain', 'invalid', 'invalid', true, true, now(), now() - interval '4 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010013', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'invalid.four@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now(), now() - interval '4 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010014', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'risky.one@example.com', 'risky', 'accept_all', 'risky', 'risky', true, true, now(), now() - interval '5 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010015', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'risky.two@example.com', 'risky', 'accept_all', 'risky', 'risky', true, true, now(), now() - interval '5 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010016', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'risky.three@example.com', 'risky', 'accept_all', 'risky', 'risky', true, true, now(), now() - interval '5 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010017', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'restricted.one@example.com', 'restricted', 'role_based', 'restricted', 'restricted', true, true, now(), now() - interval '6 days'),
    ('46925a6d-7306-4ac9-8121-bdf03c010018', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.six@example.com', 'valid', null, 'valid', 'valid', true, false, now(), now() - interval '6 days')
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        klaviyo_account_id = excluded.klaviyo_account_id,
        status = excluded.status,
        substatus = excluded.substatus,
        lh_status = excluded.lh_status,
        lh_category = excluded.lh_category,
        tagged = excluded.tagged,
        suppress = excluded.suppress,
        checked_at = excluded.checked_at,
        created_at = excluded.created_at,
        updated_at = now();

  insert into public.bulk_jobs (
    id,
    user_id,
    organization_id,
    workspace_id,
    billing_user_id,
    account_id,
    status,
    created_at
  )
  values
    ('0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, v_user_id, v_klaviyo_account_id, 'completed', now() - interval '2 days'),
    ('0f43b084-52ad-44b8-b3a6-16dfbcc10002', v_user_id, v_org_id, v_test_workspace_id, v_user_id, null, 'completed', now() - interval '8 days')
  on conflict (id) do update
    set user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        billing_user_id = excluded.billing_user_id,
        account_id = excluded.account_id,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = now();

  insert into public.bulk_emails (
    id,
    bulk_job_id,
    user_id,
    organization_id,
    workspace_id,
    email,
    status,
    substatus,
    lh_status,
    lh_category,
    tagged,
    suppress,
    created_at
  )
  values
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10001', '0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, 'bulk.valid@example.com', 'valid', null, 'valid', 'valid', true, false, now() - interval '2 days'),
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10002', '0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, 'bulk.invalid@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now() - interval '2 days'),
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10003', '0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, 'bulk.risky@example.com', 'risky', 'accept_all', 'risky', 'risky', true, true, now() - interval '2 days'),
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10004', '0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, 'bulk.restricted@example.com', 'restricted', 'role_based', 'restricted', 'restricted', true, true, now() - interval '2 days'),
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10005', '0f43b084-52ad-44b8-b3a6-16dfbcc10002', v_user_id, v_org_id, v_test_workspace_id, 'campaign.valid@example.com', 'valid', null, 'valid', 'valid', true, false, now() - interval '8 days'),
    ('60c7e99a-2c88-43e8-88b8-1f87d0c10006', '0f43b084-52ad-44b8-b3a6-16dfbcc10002', v_user_id, v_org_id, v_test_workspace_id, 'campaign.invalid@example.com', 'invalid', 'mailbox_not_found', 'invalid', 'invalid', true, true, now() - interval '8 days')
  on conflict (id) do update
    set bulk_job_id = excluded.bulk_job_id,
        user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        email = excluded.email,
        status = excluded.status,
        substatus = excluded.substatus,
        lh_status = excluded.lh_status,
        lh_category = excluded.lh_category,
        tagged = excluded.tagged,
        suppress = excluded.suppress,
        created_at = excluded.created_at,
        updated_at = now();

  insert into public.bulk_job_reports (
    id,
    bulk_job_id,
    user_id,
    organization_id,
    workspace_id,
    payload,
    created_at
  )
  values
    ('9b7c3198-233f-4e1f-95c7-0b5f4dc10001', '0f43b084-52ad-44b8-b3a6-16dfbcc10001', v_user_id, v_org_id, v_main_workspace_id, '{"total":4,"valid":1,"invalid":1,"risky":1,"restricted":1,"suppressed":3}'::jsonb, now() - interval '2 days'),
    ('9b7c3198-233f-4e1f-95c7-0b5f4dc10002', '0f43b084-52ad-44b8-b3a6-16dfbcc10002', v_user_id, v_org_id, v_test_workspace_id, '{"total":2,"valid":1,"invalid":1,"risky":0,"restricted":0,"suppressed":1}'::jsonb, now() - interval '8 days')
  on conflict (id) do update
    set bulk_job_id = excluded.bulk_job_id,
        user_id = excluded.user_id,
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        payload = excluded.payload,
        created_at = excluded.created_at,
        updated_at = now();

  insert into public.credit_history (
    id,
    user_id,
    organization_id,
    workspace_id,
    klaviyo_account_id,
    credits_delta,
    credits_remaining,
    source,
    description,
    change,
    remaining,
    reason,
    context
  )
  values
    ('823e4af8-ddc5-4970-a7fa-616217c30001', v_user_id, v_org_id, v_main_workspace_id, null, 300, 300, 'trial', 'Trial credits granted', 300, 300, 'trial', 'workspace_demo'),
    ('823e4af8-ddc5-4970-a7fa-616217c30002', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, -3, 297, 'klaviyo_sync', 'Demo Klaviyo verification usage', -3, 297, 'klaviyo_sync', 'workspace_demo')
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        klaviyo_account_id = excluded.klaviyo_account_id,
        credits_delta = excluded.credits_delta,
        credits_remaining = excluded.credits_remaining,
        source = excluded.source,
        description = excluded.description,
        change = excluded.change,
        remaining = excluded.remaining,
        reason = excluded.reason,
        context = excluded.context;
end $$;

commit;
