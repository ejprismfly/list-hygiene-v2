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
    null
  )
  on conflict (slug) do update
    set name = excluded.name,
        owner_user_id = excluded.owner_user_id,
        updated_at = now()
  returning id into v_org_id;

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
    'Main Workspace',
    'prismfly-main',
    v_user_id,
    null,
    true,
    null
  )
  on conflict (organization_id, slug) where slug is not null do update
    set name = excluded.name,
        is_default = excluded.is_default,
        archived_at = null,
        updated_at = now()
  returning id into v_main_workspace_id;

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
    'e4ab13de-2dc1-463f-ad80-a77525887b96',
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
    true,
    '2026-03-09 00:00:00+00'
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        connection_name = excluded.connection_name,
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
    true
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        billing_scope = excluded.billing_scope,
        customer_id = excluded.customer_id,
        plan_id = excluded.plan_id,
        credits_plan = excluded.credits_plan,
        credits_remaining = excluded.credits_remaining,
        credits_used = excluded.credits_used,
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
  on conflict (user_id, organization_id, workspace_id) do update
    set total_count = excluded.total_count,
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
  on conflict (month_start, user_id, organization_id, workspace_id) do update
    set valid_count = excluded.valid_count,
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
  on conflict (month_start, user_id, organization_id, workspace_id, metric, key) do update
    set count = excluded.count,
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
  on conflict (user_id, organization_id, workspace_id, order_id) do update
    set month = excluded.month,
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
    suppress,
    checked_at
  )
  values
    ('46925a6d-7306-4ac9-8121-bdf03c010001', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'valid.customer@example.com', 'valid', null, 'valid', false, now()),
    ('46925a6d-7306-4ac9-8121-bdf03c010002', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'bad.customer@example.com', 'invalid', 'mailbox_not_found', 'invalid', true, now()),
    ('46925a6d-7306-4ac9-8121-bdf03c010003', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, 'risky.customer@example.com', 'risky', 'accept_all', 'risky', true, now())
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        klaviyo_account_id = excluded.klaviyo_account_id,
        status = excluded.status,
        substatus = excluded.substatus,
        lh_status = excluded.lh_status,
        suppress = excluded.suppress,
        checked_at = excluded.checked_at,
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
    description
  )
  values
    ('823e4af8-ddc5-4970-a7fa-616217c30001', v_user_id, v_org_id, v_main_workspace_id, null, 300, 300, 'trial', 'Trial credits granted'),
    ('823e4af8-ddc5-4970-a7fa-616217c30002', v_user_id, v_org_id, v_main_workspace_id, v_klaviyo_account_id, -3, 297, 'klaviyo_sync', 'Demo Klaviyo verification usage')
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        klaviyo_account_id = excluded.klaviyo_account_id,
        credits_delta = excluded.credits_delta,
        credits_remaining = excluded.credits_remaining,
        source = excluded.source,
        description = excluded.description;
end $$;

commit;
