create extension if not exists pgcrypto;

do $$
declare
  admin_auth_user_id uuid;
  admin_email text := 'admin@saknarin.local';
  admin_username text := 'admin';
  admin_password text := '123456';
  admin_member_no text := 'ADMIN001';
begin
  insert into public.members (member_no, title, first_name, last_name, active)
  values (admin_member_no, 'นาย', 'Admin', 'System', true)
  on conflict (member_no) do update
    set title = excluded.title,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        active = true;

  select id
  into admin_auth_user_id
  from auth.users
  where email = admin_email
  limit 1;

  if exists (
    select 1
    from public.app_users
    where username = admin_username
      and auth_user_id <> coalesce(admin_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'Username % ถูกใช้งานโดยบัญชีอื่นแล้ว', admin_username;
  end if;

  if exists (
    select 1
    from public.app_users
    where member_no = admin_member_no
      and auth_user_id <> coalesce(admin_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'member_no % ถูกผูกกับบัญชีอื่นแล้ว', admin_member_no;
  end if;

  if admin_auth_user_id is null then
    admin_auth_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      email_change_token_new,
      email_change,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_change,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      is_sso_user,
      deleted_at,
      is_anonymous,
      confirmed_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      admin_auth_user_id,
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      now(),
      '',
      now(),
      '',
      '',
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', admin_username, 'member_no', admin_member_no),
      false,
      now(),
      now(),
      null,
      '',
      0,
      null,
      '',
      false,
      null,
      false,
      now()
    );
  else
    update auth.users
    set encrypted_password = crypt(admin_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmed_at = coalesce(confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('username', admin_username, 'member_no', admin_member_no),
        updated_at = now()
    where id = admin_auth_user_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    admin_auth_user_id,
    jsonb_build_object(
      'sub', admin_auth_user_id::text,
      'email', admin_email,
      'email_verified', true
    ),
    'email',
    admin_auth_user_id::text,
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        last_sign_in_at = excluded.last_sign_in_at,
        updated_at = excluded.updated_at;

  insert into public.app_users (
    auth_user_id,
    member_no,
    title,
    first_name,
    last_name,
    username,
    role,
    approval_status,
    approved_at
  )
  values (
    admin_auth_user_id,
    admin_member_no,
    'นาย',
    'Admin',
    'System',
    admin_username,
    'admin',
    'approved',
    now()
  )
  on conflict (auth_user_id) do update
    set member_no = excluded.member_no,
        title = excluded.title,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        role = 'admin',
        approval_status = 'approved',
        approved_at = coalesce(public.app_users.approved_at, now());
end $$;