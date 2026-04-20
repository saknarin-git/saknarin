alter table public.loan_payments
  add column if not exists external_reference text;

update public.loan_payments
set external_reference = concat('LEGACY-', id::text)
where coalesce(nullif(trim(external_reference), ''), null) is null;