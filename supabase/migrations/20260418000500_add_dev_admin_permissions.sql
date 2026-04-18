alter table public.app_users drop constraint if exists app_users_role_check;

alter table public.app_users
  add constraint app_users_role_check check (role in ('member', 'officer', 'admin', 'dev_admin'));

alter table public.app_settings
  add column if not exists role_permissions jsonb not null default jsonb_build_object(
    'member', jsonb_build_object(
      'view_system_dashboard', true,
      'view_user_workspace', true,
      'view_officer_workspace', false,
      'manage_members', false,
      'manage_loans', false,
      'access_devmanager', false
    ),
    'officer', jsonb_build_object(
      'view_system_dashboard', true,
      'view_user_workspace', true,
      'view_officer_workspace', true,
      'manage_members', true,
      'manage_loans', true,
      'access_devmanager', false
    ),
    'admin', jsonb_build_object(
      'view_system_dashboard', true,
      'view_user_workspace', true,
      'view_officer_workspace', true,
      'manage_members', true,
      'manage_loans', true,
      'access_devmanager', true
    ),
    'dev_admin', jsonb_build_object(
      'view_system_dashboard', true,
      'view_user_workspace', true,
      'view_officer_workspace', true,
      'manage_members', true,
      'manage_loans', true,
      'access_devmanager', true
    )
  );

update public.app_users
set role = 'dev_admin'
where role = 'admin';