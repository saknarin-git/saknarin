alter table public.members
  add column if not exists legacy_status text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.loan_contracts (
  contract_no text primary key,
  member_no text not null references public.members(member_no),
  title text not null,
  first_name text not null,
  last_name text not null,
  loan_amount numeric(14, 2) not null default 0,
  outstanding_amount numeric(14, 2) not null default 0,
  status text,
  contract_date date,
  guarantor_1 text not null,
  guarantor_2 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_loan_contracts_member_no on public.loan_contracts(member_no);
create index if not exists idx_loan_contracts_status on public.loan_contracts(status);

alter table public.loan_contracts enable row level security;