alter table public.app_settings
  add column if not exists loan_report_paper_settings jsonb not null default jsonb_build_object(
    'paper_size', 'a4',
    'orientation', 'portrait',
    'margin_mm', 10,
    'font_scale', 1,
    'table_width_percent', 100,
    'table_height_percent', 100
  );

update public.app_settings
set loan_report_paper_settings = jsonb_build_object(
  'paper_size', coalesce(loan_report_paper_settings ->> 'paper_size', 'a4'),
  'orientation', coalesce(loan_report_paper_settings ->> 'orientation', 'portrait'),
  'margin_mm', coalesce((loan_report_paper_settings ->> 'margin_mm')::numeric, 10),
  'font_scale', coalesce((loan_report_paper_settings ->> 'font_scale')::numeric, 1),
  'table_width_percent', coalesce((loan_report_paper_settings ->> 'table_width_percent')::numeric, 100),
  'table_height_percent', coalesce((loan_report_paper_settings ->> 'table_height_percent')::numeric, 100)
)
where loan_report_paper_settings is null
   or jsonb_typeof(loan_report_paper_settings) <> 'object'
   or not (loan_report_paper_settings ? 'table_width_percent')
   or not (loan_report_paper_settings ? 'table_height_percent');