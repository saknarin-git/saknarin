with legacy_refs as (
  select
    id,
    created_by,
    greatest(floor(extract(epoch from created_at) * 1000)::bigint, 1) as created_at_ms,
    row_number() over (
      partition by greatest(floor(extract(epoch from created_at) * 1000)::bigint, 1), (created_by is null)
      order by created_at, id
    ) as sequence_no,
    count(*) over (
      partition by greatest(floor(extract(epoch from created_at) * 1000)::bigint, 1), (created_by is null)
    ) as duplicate_count
  from public.loan_payments
  where external_reference like 'LEGACY-%'
),
formatted_refs as (
  select
    id,
    case
      when created_by is null then concat('tx-local-', created_at_ms::text, '-', sequence_no::text)
      when duplicate_count > 1 then concat('tx-', created_at_ms::text, '-', sequence_no::text)
      else concat('tx-', created_at_ms::text)
    end as next_reference
  from legacy_refs
)
update public.loan_payments loan_payment
set external_reference = formatted_refs.next_reference
from formatted_refs
where loan_payment.id = formatted_refs.id;