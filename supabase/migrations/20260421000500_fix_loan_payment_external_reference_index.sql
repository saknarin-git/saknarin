drop index if exists public.idx_loan_payments_external_reference;

create unique index if not exists idx_loan_payments_external_reference
  on public.loan_payments(external_reference);