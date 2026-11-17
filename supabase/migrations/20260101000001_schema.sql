-- Robotics & AI Lab Manager: Supabase schema. Run once in Supabase -> SQL Editor.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null, full_name text default '',
  role text not null default 'teacher' check (role in ('admin','lab_assistant','teacher')),
  can_mark_attendance boolean default false, is_active boolean default true);
create table divisions (id serial primary key, name text unique not null);
create table batches (id serial primary key, name text unique not null);
create table students (id serial primary key, prn text unique not null, name text not null, division text not null,
  roll_no text not null, qr_token text unique default replace(gen_random_uuid()::text,'-',''), is_active boolean default true);
create table teachers (id serial primary key, name text unique not null, is_active boolean default true,
  teacher_code text unique, department text default '', designation text default '', email text default '',
  mobile text default '', subjects text default '', batches_text text default '', remarks text default '');
create table inventory_items (id serial primary key, name text unique not null, category text default 'General',
  total_qty int default 0 check (total_qty >= 0), min_stock int default 0);
create table issue_slips (id serial primary key, slip_no text unique not null, issue_date date not null, batch text,
  taken_by text not null check (taken_by in ('Student','Teacher')),
  student_id int references students, teacher_id int references teachers,
  created_by uuid references profiles, created_at timestamptz default now(),
  check ((taken_by='Student' and student_id is not null and teacher_id is null) or
         (taken_by='Teacher' and teacher_id is not null and student_id is null)));
create table issue_transactions (id serial primary key, slip_id int not null references issue_slips,
  item_id int not null references inventory_items, qty int not null check (qty > 0),
  returned_qty int default 0, returned_on date, check (returned_qty between 0 and qty));
create table return_transactions (id serial primary key, line_id int not null references issue_transactions,
  qty int not null check (qty > 0), returned_on date not null, received_by uuid references profiles, note text default '');
create table stock_adjustments (id serial primary key, item_id int not null references inventory_items, delta int not null,
  reason text default '', user_id uuid references profiles, created_at timestamptz default now());
create table app_settings (key text primary key, value text not null default '');

-- first account created in Supabase Auth becomes admin; later ones default to teacher (change in Settings)
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, role) values (new.id, split_part(new.email,'@',1),
    case when exists (select 1 from profiles) then 'teacher' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function my_role() returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and is_active $$;

create view inventory_view with (security_invoker = true) as
  select i.*, coalesce(sum(t.qty - t.returned_qty), 0)::int as out_now
  from inventory_items i left join issue_transactions t on t.item_id = i.id group by i.id;

-- Row Level Security: everyone signed in and active can read; only admin/lab_assistant can write
do $$ declare t text; begin
  foreach t in array array['divisions','batches','students','teachers','inventory_items','issue_slips',
    'issue_transactions','return_transactions','stock_adjustments','app_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (my_role() is not null)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (my_role() in (''admin'',''lab_assistant'')) with check (my_role() in (''admin'',''lab_assistant''))', t);
  end loop; end $$;
alter table profiles enable row level security;
create policy "read profiles" on profiles for select to authenticated using (my_role() is not null);
create policy "admin edits profiles" on profiles for update to authenticated using (my_role() = 'admin');

-- Issue items: one transaction, row locks, sequential slip numbers. Errors look like '409|message'.
create function issue_items(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare sid int; tid int; slip text; ln jsonb; it record; need int; avail int; n int; uid uuid := auth.uid();
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  if jsonb_array_length(coalesce(p->'lines','[]')) = 0 then raise exception '422|Add at least one item'; end if;
  if p->>'taken_by' = 'Student' then
    select id into sid from students where prn = trim(p->>'prn');
    if sid is null then raise exception '404|PRN not found - verify the student first'; end if;
  else
    if trim(coalesce(p->>'teacher_name','')) = '' then raise exception '422|Teacher name is required'; end if;
    select id into tid from teachers where lower(name) = lower(trim(p->>'teacher_name'));
    if tid is null then insert into teachers(name) values (trim(p->>'teacher_name')) returning id into tid; end if;
  end if;
  perform 1 from inventory_items where id in (select (l->>'item_id')::int from jsonb_array_elements(p->'lines') l)
    order by id for update;                                      -- lock in id order: no deadlock / oversell
  for it in select i.id, i.name, i.total_qty, sum((l->>'qty')::int) as need
            from jsonb_array_elements(p->'lines') l join inventory_items i on i.id = (l->>'item_id')::int
            group by i.id order by i.id loop
    select coalesce(sum(qty - returned_qty),0) into n from issue_transactions where item_id = it.id;
    avail := it.total_qty - n;
    if it.need <= 0 then raise exception '422|Quantity for % must be positive', it.name; end if;
    if it.need > avail then raise exception '409|Only % of ''%'' available (requested %)', avail, it.name, it.need; end if;
  end loop;
  insert into app_settings(key, value) values ('slip_counter','0') on conflict do nothing;
  update app_settings set value = (greatest(value::int, coalesce((select max(slip_no::int) from issue_slips where slip_no ~ '^\d+$'),0)) + 1)::text
    where key = 'slip_counter' returning value into slip;
  insert into issue_slips(slip_no, issue_date, batch, taken_by, student_id, teacher_id, created_by)
    values (slip, (p->>'issue_date')::date, nullif(p->>'batch',''), p->>'taken_by', sid, tid, uid) returning id into n;
  for ln in select * from jsonb_array_elements(p->'lines') loop
    if not exists (select 1 from inventory_items where id = (ln->>'item_id')::int) then raise exception '404|Unknown item in request'; end if;
    insert into issue_transactions(slip_id, item_id, qty) values (n, (ln->>'item_id')::int, (ln->>'qty')::int);
  end loop;
  return slip;
end $$;
grant execute on function issue_items(jsonb) to authenticated;
insert into inventory_items(name) values ('Arduino Uno'),('Jumper Wires') on conflict do nothing;
