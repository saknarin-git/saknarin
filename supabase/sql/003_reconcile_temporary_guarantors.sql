begin;

drop table if exists temp_temporary_guarantor_matches;

create temporary table temp_temporary_guarantor_matches as
with candidate_pairs as (
  select
    temp.member_no as temporary_member_no,
    real.member_no as real_member_no,
    real.first_name,
    real.last_name
  from public.members as temp
  join public.members as real
    on real.first_name = temp.first_name
   and real.last_name = temp.last_name
   and real.member_no <> temp.member_no
  where temp.member_no ~* '^TMP-'
    and coalesce(temp.legacy_status, '') ilike '%ผู้ค้ำชั่วคราว%'
    and real.member_no !~* '^TMP-'
), uniquely_matched_pairs as (
  select
    temporary_member_no,
    min(real_member_no) as real_member_no
  from candidate_pairs
  group by temporary_member_no
  having count(distinct real_member_no) = 1
)
select
  matched.temporary_member_no,
  matched.real_member_no
from uniquely_matched_pairs as matched;

update public.loan_contracts as loan
set
  guarantor_1 = case when loan.guarantor_1 = matched.temporary_member_no then matched.real_member_no else loan.guarantor_1 end,
  guarantor_2 = case when loan.guarantor_2 = matched.temporary_member_no then matched.real_member_no else loan.guarantor_2 end,
  updated_at = now()
from temp_temporary_guarantor_matches as matched
where loan.guarantor_1 = matched.temporary_member_no
   or loan.guarantor_2 = matched.temporary_member_no;

update public.members as real
set
  legacy_status = case
    when coalesce(trim(real.legacy_status), '') = '' then 'ปกติ'
    when coalesce(real.legacy_status, '') ilike '%ผู้ค้ำชั่วคราว%' then 'ปกติ'
    else real.legacy_status
  end,
  active = case
    when coalesce(trim(real.legacy_status), '') = '' then true
    when coalesce(real.legacy_status, '') ilike '%ผู้ค้ำชั่วคราว%' then true
    else real.active
  end,
  updated_at = now()
from temp_temporary_guarantor_matches as matched
where real.member_no = matched.real_member_no;

delete from public.members as temp
using temp_temporary_guarantor_matches as matched
where temp.member_no = matched.temporary_member_no
  and not exists (
    select 1
    from public.loan_contracts as loan
    where loan.member_no = temp.member_no
       or loan.guarantor_1 = temp.member_no
       or loan.guarantor_2 = temp.member_no
  )
  and not exists (
    select 1
    from public.app_users as app_user
    where app_user.member_no = temp.member_no
  );

select
  count(*) as matched_temporary_members,
  count(distinct real_member_no) as affected_real_members
from temp_temporary_guarantor_matches;

select
  temp.member_no as unresolved_temporary_member_no,
  temp.first_name,
  temp.last_name,
  temp.legacy_status
from public.members as temp
where temp.member_no ~* '^TMP-'
  and coalesce(temp.legacy_status, '') ilike '%ผู้ค้ำชั่วคราว%'
  and not exists (
    select 1
    from temp_temporary_guarantor_matches as matched
    where matched.temporary_member_no = temp.member_no
  )
order by temp.first_name, temp.last_name, temp.member_no;

commit;