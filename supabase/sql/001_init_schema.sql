create extension if not exists pgcrypto;

create table if not exists public.members (
  member_no text primary key,
  title text not null,
  first_name text not null,
  last_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  member_no text not null references public.members(member_no),
  title text not null,
  first_name text not null,
  last_name text not null,
  username text not null unique,
  role text not null default 'member' check (role in ('member', 'admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_users_member_no on public.app_users(member_no);
create index if not exists idx_app_users_username_lower on public.app_users(lower(username));

create table if not exists public.app_settings (
  id integer primary key default 1,
  group_name text not null default 'กลุ่มออมทรัพย์เพื่อการผลิต บ้านพิตำ',
  notice text not null default 'ผู้ดูแลระบบสามารถตั้งค่าประกาศได้จากหน้า DevManager',
  allow_registration boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id = 1)
);

insert into public.app_settings (id, group_name, notice, allow_registration)
values (1, 'กลุ่มออมทรัพย์เพื่อการผลิต บ้านพิตำ', 'ผู้ดูแลระบบสามารถตั้งค่าประกาศได้จากหน้า DevManager', true)
on conflict (id) do nothing;

alter table public.members enable row level security;
alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;