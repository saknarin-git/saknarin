do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'loan_types'
      and column_name = 'monthly_interest_rate'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'loan_types'
      and column_name = 'annual_interest_rate'
  ) then
    alter table public.loan_types rename column monthly_interest_rate to annual_interest_rate;
  end if;
end $$;

alter table public.loan_types
  alter column annual_interest_rate set default 12;