create table if not exists public.loan_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_interest_rate numeric(8, 4) not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loan_types (name, monthly_interest_rate, active)
values ('เงินกู้ทั่วไป', 12, true)
on conflict (name) do nothing;

alter table public.loan_contracts
  add column if not exists loan_type_id uuid references public.loan_types(id);

update public.loan_contracts
set loan_type_id = (select id from public.loan_types order by created_at asc limit 1)
where loan_type_id is null;

alter table public.app_settings
  add column if not exists loan_working_days jsonb not null default jsonb_build_object(
    'year', extract(year from now())::integer,
    'months', jsonb_build_array(
      jsonb_build_object('month', 1, 'date', null),
      jsonb_build_object('month', 2, 'date', null),
      jsonb_build_object('month', 3, 'date', null),
      jsonb_build_object('month', 4, 'date', null),
      jsonb_build_object('month', 5, 'date', null),
      jsonb_build_object('month', 6, 'date', null),
      jsonb_build_object('month', 7, 'date', null),
      jsonb_build_object('month', 8, 'date', null),
      jsonb_build_object('month', 9, 'date', null),
      jsonb_build_object('month', 10, 'date', null),
      jsonb_build_object('month', 11, 'date', null),
      jsonb_build_object('month', 12, 'date', null)
    )
  );

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  contract_no text not null references public.loan_contracts(contract_no) on delete cascade,
  member_no text not null references public.members(member_no) on delete cascade,
  payment_mode text not null check (payment_mode in ('normal', 'settlement')),
  paid_date date not null default current_date,
  principal_paid numeric(14, 2) not null default 0,
  interest_paid numeric(14, 2) not null default 0,
  interest_installments_paid integer not null default 1,
  remaining_balance numeric(14, 2) not null default 0,
  note text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_loan_payments_contract_no on public.loan_payments(contract_no);
create index if not exists idx_loan_payments_member_no on public.loan_payments(member_no);
create index if not exists idx_loan_payments_paid_date on public.loan_payments(paid_date desc);

alter table public.loan_types enable row level security;
alter table public.loan_payments enable row level security;