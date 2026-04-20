alter table public.loan_payments
  add column if not exists external_reference text,
  add column if not exists operator_name text,
  add column if not exists member_name text,
  add column if not exists transaction_status text,
  add column if not exists overdue_interest_before integer not null default 0,
  add column if not exists overdue_interest_after integer not null default 0;

create unique index if not exists idx_loan_payments_external_reference
  on public.loan_payments(external_reference)
  where external_reference is not null;