alter table public.loan_payments
  add column if not exists interest_installments_paid integer not null default 1;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'loan_payments'
      and column_name = 'overdue_installments_paid'
  ) then
    execute $update$
      update public.loan_payments
      set interest_installments_paid = greatest(coalesce(overdue_installments_paid, 0), 1)
      where interest_installments_paid is null or interest_installments_paid = 1
    $update$;
  end if;
end $$;

alter table public.app_settings
  alter column loan_working_days set default jsonb_build_object(
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

update public.app_settings
set loan_working_days = jsonb_build_object(
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
)
where loan_working_days is null
   or jsonb_typeof(loan_working_days) <> 'object';