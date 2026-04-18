insert into public.members (member_no, title, first_name, last_name, active)
values ('ADMIN001', 'นาย', 'Admin', 'System', true)
on conflict (member_no) do update
set title = excluded.title,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    active = excluded.active;