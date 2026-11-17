-- ONE script for everything after schema.sql. Safe to run again any time (idempotent). Paste ALL of it in Supabase -> SQL Editor -> Run.

-- ===== update_1_returns =====
-- Update 1: Return Items + Issue History/Register. Run once in Supabase -> SQL Editor.
create or replace view register_view with (security_invoker = true) as
select t.id as line_id, s.id as slip_id, s.slip_no, s.issue_date, coalesce(s.batch,'') as batch, s.taken_by,
  coalesce(st.prn,'') as prn, coalesce(te.name,'') as teacher_name, coalesce(st.name,'') as student_name,
  coalesce(st.division,'') as division, coalesce(st.roll_no,'') as roll_no, i.name as item, t.qty, t.returned_qty,
  (t.qty - t.returned_qty) as outstanding, t.returned_on,
  case when t.returned_qty >= t.qty then 'Returned' when t.returned_qty > 0 then 'Partially Returned' else 'Not Returned' end as status
from issue_transactions t join issue_slips s on s.id = t.slip_id join inventory_items i on i.id = t.item_id
left join students st on st.id = s.student_id left join teachers te on te.id = s.teacher_id;

-- Return a whole slip (no "lines") or chosen quantities of its lines, all-or-nothing, with row locks.
create or replace function return_items(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare sl issue_slips; l issue_transactions; r record; ln jsonb; lid int; q int; n int := 0;
  rd date := (p->>'returned_on')::date; want jsonb := '{}'; iname text;
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  if rd is null then raise exception '422|Return date is required'; end if;
  if p ? 'slip_no' then
    select * into sl from issue_slips where slip_no = trim(p->>'slip_no') for update;
  else
    select s.* into sl from issue_slips s join issue_transactions t on t.slip_id = s.id
      where t.id = ((p->'lines'->0)->>'line_id')::int for update of s;
  end if;
  if sl.id is null then raise exception '404|Slip not found'; end if;
  if rd < sl.issue_date then raise exception '422|Return date cannot be before the issue date'; end if;
  if rd > current_date then raise exception '422|Return date cannot be in the future'; end if;
  perform 1 from issue_transactions where slip_id = sl.id order by id for update;
  if jsonb_typeof(p->'lines') is distinct from 'array' then
    for l in select * from issue_transactions where slip_id = sl.id and qty > returned_qty loop
      want := want || jsonb_build_object(l.id::text, l.qty - l.returned_qty);
    end loop;
  else
    for ln in select * from jsonb_array_elements(p->'lines') loop
      lid := (ln->>'line_id')::int; q := (ln->>'qty')::int;
      if not exists (select 1 from issue_transactions where id = lid and slip_id = sl.id) then
        raise exception '422|Line % does not belong to slip %', lid, sl.slip_no; end if;
      if q <= 0 then raise exception '422|Return quantity must be positive'; end if;
      want := want || jsonb_build_object(lid::text, coalesce((want->>lid::text)::int, 0) + q);
    end loop;
  end if;
  for r in select key, value::text::int as q from jsonb_each(want) loop
    select * into l from issue_transactions where id = r.key::int;
    if r.q > l.qty - l.returned_qty then
      select name into iname from inventory_items where id = l.item_id;
      raise exception '409|Only % of ''%'' outstanding; cannot return %', l.qty - l.returned_qty, iname, r.q; end if;
  end loop;
  if want = '{}'::jsonb then raise exception '409|Slip % has nothing left to return (already fully returned)', sl.slip_no; end if;
  for r in select key, value::text::int as q from jsonb_each(want) loop
    update issue_transactions set returned_qty = returned_qty + r.q,
      returned_on = case when returned_qty + r.q = qty then rd else returned_on end where id = r.key::int;
    insert into return_transactions(line_id, qty, returned_on, received_by, note)
      values (r.key::int, r.q, rd, auth.uid(), coalesce(p->>'note',''));
    n := n + 1;
  end loop;
  return jsonb_build_object('slip_no', sl.slip_no, 'lines_returned', n);
end $$;
grant execute on function return_items(jsonb) to authenticated;

-- ===== update_2_modules =====
-- Update 2: tables for Lab Assets, Computers, Allocations, Maintenance, Lab Timetable. Run once in Supabase -> SQL Editor.
create table if not exists lab_assets (
  id serial primary key, asset_id text unique not null, name text not null, category text not null default 'General',
  kind text not null default '', tracking text not null default 'quantity' check (tracking in ('individual','quantity')),
  brand text not null default '', model text not null default '', serial_number text unique,
  quantity int not null default 1, working int not null default 1, damaged int not null default 0,
  under_maintenance int not null default 0, min_quantity int not null default 0, location text not null default '',
  purchase_date date, warranty_expiry date, supplier text not null default '', purchase_cost numeric,
  remarks text not null default '', parent_pk int references lab_assets, created_at timestamptz default now(),
  check (quantity >= 0 and working >= 0 and damaged >= 0 and under_maintenance >= 0),
  check (working + damaged + under_maintenance = quantity), check (parent_pk is null or parent_pk <> id));
create index if not exists ix_lab_assets_parent on lab_assets(parent_pk);
create table if not exists timetable_entries (
  id serial primary key, day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  time_from text not null, time_to text not null, batch text not null, division text not null default '',
  subject text not null, teacher_id int not null references teachers, lab text not null default '',
  remarks text not null default '', created_at timestamptz default now(), check (time_from < time_to));
create table if not exists asset_allocations (
  id serial primary key, asset_pk int not null references lab_assets, allocated_to text not null, purpose text not null default '',
  qty int not null check (qty > 0), location text not null default '', allocated_on date not null, returned_on date,
  remarks text not null default '', created_by uuid references profiles);
create table if not exists complaints (
  id serial primary key, complaint_no text unique not null, complaint_date date not null, equipment_name text not null,
  asset_pk int references lab_assets, description text not null, reported_by text not null default '',
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  assigned_technician text not null default '', status text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  resolution_details text not null default '', resolution_date date, remarks text not null default '',
  created_by uuid references profiles, created_at timestamptz default now());
do $$ declare t text; begin
  foreach t in array array['lab_assets','timetable_entries','asset_allocations','complaints'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (my_role() is not null)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (my_role() in (''admin'',''lab_assistant'')) with check (my_role() in (''admin'',''lab_assistant''))', t);
  end loop; end $$;

-- ===== update_3_assets =====
-- Update 3: Lab Assets, Allocations, Computer Systems. Run once in Supabase -> SQL Editor (after update_2_modules.sql).
create table if not exists asset_transfers (
  id serial primary key, asset_pk int not null references lab_assets, from_location text not null default '',
  to_location text not null, qty int not null default 1, transferred_on date not null,
  transferred_by text not null default '', remarks text not null default '');
create table if not exists maintenance_logs (
  id serial primary key, asset_pk int not null references lab_assets, log_date date not null,
  kind text not null default 'Repair', description text not null, cost numeric,
  performed_by text not null default '', complaint_pk int references complaints on delete set null);
do $$ declare t text; begin
  foreach t in array array['asset_transfers','maintenance_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (my_role() is not null)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (my_role() in (''admin'',''lab_assistant'')) with check (my_role() in (''admin'',''lab_assistant''))', t);
  end loop; end $$;

create or replace view assets_view with (security_invoker = true) as
select a.*, coalesce(p.asset_id,'') as parent_asset_id,
  coalesce((select sum(x.qty) from asset_allocations x where x.asset_pk = a.id and x.returned_on is null),0)::int as allocated
from lab_assets a left join lab_assets p on p.id = a.parent_pk;

create or replace function my_username() returns text language sql stable security definer set search_path = public as
$$ select username from profiles where id = auth.uid() $$;

create or replace function next_asset_id() returns text language sql stable set search_path = public as
$$ select 'AST-' || lpad((coalesce(max(substring(asset_id from '^AST-(\d+)$')::int),0) + 1)::text, 4, '0') from lab_assets $$;

-- Allocate units of an asset (locks the asset row so two people cannot over-allocate).
create or replace function allocate_asset(p jsonb) returns int language plpgsql security definer set search_path = public as $$
declare a lab_assets; used int; free int; q int := (p->>'qty')::int; nid int;
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select * into a from lab_assets where id = (p->>'asset_pk')::int for update;
  if a.id is null then raise exception '404|Asset not found'; end if;
  if q is null or q <= 0 then raise exception '422|Quantity must be at least 1'; end if;
  if trim(coalesce(p->>'allocated_to','')) = '' then raise exception '422|Allocated-to is required'; end if;
  select coalesce(sum(qty),0) into used from asset_allocations where asset_pk = a.id and returned_on is null;
  free := a.working - used;
  if q > free then raise exception '409|Only % working unit(s) of ''%'' are free to allocate', greatest(free,0), a.name; end if;
  insert into asset_allocations(asset_pk, allocated_to, purpose, qty, location, allocated_on, remarks, created_by)
    values (a.id, trim(p->>'allocated_to'), coalesce(p->>'purpose',''), q,
      coalesce(nullif(trim(coalesce(p->>'location','')),''), a.location), (p->>'allocated_on')::date, coalesce(p->>'remarks',''), auth.uid())
    returning id into nid;
  return nid;
end $$;

create or replace function return_allocation(aid int, d date) returns void language plpgsql security definer set search_path = public as $$
declare x asset_allocations;
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select * into x from asset_allocations where id = aid for update;
  if x.id is null then raise exception '404|Allocation not found'; end if;
  if x.returned_on is not null then raise exception '409|This allocation was already returned'; end if;
  if d < x.allocated_on then raise exception '422|Return date cannot be before the allocation date'; end if;
  update asset_allocations set returned_on = d where id = aid;
end $$;

-- Move units between Working / Damaged / Under maintenance (logged in history).
create or replace function move_condition(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare a lab_assets; used int; q int := (p->>'qty')::int; f text := p->>'from_state'; t text := p->>'to_state';
  w int; dm int; um int; have int;
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select * into a from lab_assets where id = (p->>'asset_pk')::int for update;
  if a.id is null then raise exception '404|Asset not found'; end if;
  if f = t then raise exception '422|Choose two different conditions'; end if;
  if q is null or q <= 0 then raise exception '422|Quantity must be at least 1'; end if;
  w := a.working; dm := a.damaged; um := a.under_maintenance;
  have := case f when 'working' then w when 'damaged' then dm else um end;
  if have < q then raise exception '409|Only % unit(s) are currently %', have, replace(f,'_',' '); end if;
  if f = 'working' then
    select coalesce(sum(qty),0) into used from asset_allocations where asset_pk = a.id and returned_on is null;
    if w - q < used then raise exception '409|Those units are allocated. Return the allocation first.'; end if;
  end if;
  if f = 'working' then w := w - q; elsif f = 'damaged' then dm := dm - q; else um := um - q; end if;
  if t = 'working' then w := w + q; elsif t = 'damaged' then dm := dm + q; else um := um + q; end if;
  update lab_assets set working = w, damaged = dm, under_maintenance = um where id = a.id;
  insert into maintenance_logs(asset_pk, log_date, kind, description, performed_by)
    values (a.id, current_date, 'Other', trim(format('%s unit(s): %s -> %s. %s', q, replace(f,'_',' '), replace(t,'_',' '), coalesce(p->>'note',''))), coalesce(my_username(),''));
end $$;

-- Move an asset (and its linked accessories) to another location, recording the transfer.
create or replace function transfer_asset(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare a lab_assets; c lab_assets; dest text := trim(coalesce(p->>'to_location','')); d date := (p->>'transferred_on')::date;
  xby text := coalesce(nullif(trim(coalesce(p->>'transferred_by','')),''), my_username(), '');
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select * into a from lab_assets where id = (p->>'asset_pk')::int for update;
  if a.id is null then raise exception '404|Asset not found'; end if;
  if dest = '' then raise exception '422|Destination is required'; end if;
  if lower(trim(a.location)) = lower(dest) then raise exception '422|Asset is already in that location'; end if;
  insert into asset_transfers(asset_pk, from_location, to_location, qty, transferred_on, transferred_by, remarks)
    values (a.id, a.location, dest, a.quantity, d, xby, coalesce(p->>'remarks',''));
  for c in select * from lab_assets where parent_pk = a.id loop
    insert into asset_transfers(asset_pk, from_location, to_location, qty, transferred_on, transferred_by, remarks)
      values (c.id, c.location, dest, c.quantity, d, xby, 'With ' || a.asset_id);
    update lab_assets set location = dest where id = c.id;
  end loop;
  update lab_assets set location = dest where id = a.id;
end $$;

-- Create 1..200 computers (PC-001...) with optional accessory records, all-or-nothing.
create or replace function bulk_add_computers(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare cnt int := coalesce((p->>'count')::int,1); st int := coalesce((p->>'start')::int,1); dg int := coalesce((p->>'digits')::int,3);
  pre text := coalesce(p->>'prefix','PC-'); acc jsonb := coalesce(p->'with_accessories','[]'); sers jsonb := coalesce(p->'serials','[]');
  codes jsonb := '{"CPU":"CPU","Monitor":"MON","Keyboard":"KBD","Mouse":"MSE","UPS":"UPS","Computer Accessories":"ACC"}';
  loc text := trim(coalesce(p->>'location','')); i int; aid text; k text; ser text; pcid int; wanted text[] := '{}'; taken text; filled text[];
  pd date := nullif(p->>'purchase_date','')::date; wx date := nullif(p->>'warranty_expiry','')::date; sup text := coalesce(p->>'supplier','');
  nm text := coalesce(nullif(trim(p->>'name'),''),'Desktop Computer'); n_acc int := jsonb_array_length(acc);
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  if cnt < 1 or cnt > 200 then raise exception '422|Count must be between 1 and 200'; end if;
  for k in select jsonb_array_elements_text(acc) loop
    if not codes ? k then raise exception '422|Unknown accessory type: %', k; end if; end loop;
  if jsonb_array_length(sers) > 0 and jsonb_array_length(sers) <> cnt then
    raise exception '422|You gave % serial numbers for % computers (leave serials empty, or give one per computer)', jsonb_array_length(sers), cnt; end if;
  if wx is not null and pd is not null and wx < pd then raise exception '422|Warranty expiry cannot be before the purchase date'; end if;
  select array_agg(lower(trim(s))) into filled from jsonb_array_elements_text(sers) s where trim(s) <> '';
  if filled is not null and cardinality(filled) <> (select count(distinct x) from unnest(filled) x) then
    raise exception '422|The same serial number appears twice in your list'; end if;
  for i in 0..cnt-1 loop
    aid := pre || lpad((st + i)::text, dg, '0'); wanted := wanted || aid;
    for k in select jsonb_array_elements_text(acc) loop wanted := wanted || (aid || '-' || (codes->>k)); end loop;
  end loop;
  select string_agg(asset_id, ', ') into taken from (select asset_id from lab_assets where asset_id = any(wanted) order by asset_id limit 8) t;
  if taken is not null then raise exception '409|These Asset IDs already exist: %. Change the prefix or start number.', taken; end if;
  if filled is not null and exists (select 1 from lab_assets where lower(serial_number) = any(filled)) then
    raise exception '409|One or more serial numbers are already registered'; end if;
  for i in 0..cnt-1 loop
    aid := pre || lpad((st + i)::text, dg, '0'); ser := nullif(trim(coalesce(sers->>i,'')),'');
    insert into lab_assets(asset_id, name, category, kind, tracking, brand, model, serial_number, quantity, working, location, purchase_date, warranty_expiry, supplier)
      values (aid, nm, 'Computer', 'Desktop Computer', 'individual', coalesce(p->>'brand',''), coalesce(p->>'model',''), ser, 1, 1, loc, pd, wx, sup)
      returning id into pcid;
    for k in select jsonb_array_elements_text(acc) loop
      insert into lab_assets(asset_id, name, category, kind, tracking, quantity, working, location, purchase_date, warranty_expiry, supplier, parent_pk)
        values (aid || '-' || (codes->>k), k, 'Computer', k, 'individual', 1, 1, loc, pd, wx, sup, pcid);
    end loop;
  end loop;
  return jsonb_build_object('created', cnt, 'first', pre || lpad(st::text, dg, '0'), 'last', pre || lpad((st+cnt-1)::text, dg, '0'), 'accessories', cnt * n_acc);
end $$;
grant execute on function allocate_asset(jsonb), return_allocation(int,date), move_condition(jsonb), transfer_asset(jsonb), bulk_add_computers(jsonb), next_asset_id() to authenticated;

-- ===== update_4_maintenance =====
-- Update 4: Maintenance Register, Teachers, Batches. Run after update_3_assets.sql (or just run run_all_updates.sql).
-- Everyone signed in (incl. teachers) may file a complaint; only admin / lab_assistant may edit or delete.
drop policy if exists "anyone files complaints" on complaints;
create policy "anyone files complaints" on complaints for insert to authenticated with check (my_role() is not null);

-- Rename a batch everywhere (issue slips + timetable keep the batch as text), all-or-nothing.
create or replace function rename_batch(bid int, newname text) returns void language plpgsql security definer set search_path = public as $$
declare old text; nn text := trim(coalesce(newname,''));
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select name into old from batches where id = bid for update;
  if old is null then raise exception '404|Batch not found'; end if;
  if nn = '' then raise exception '422|Batch name is required'; end if;
  if exists (select 1 from batches where lower(name) = lower(nn) and id <> bid) then raise exception '409|Batch already exists'; end if;
  update batches set name = nn where id = bid;
  update issue_slips set batch = nn where batch = old;
  update timetable_entries set batch = nn where batch = old;
end $$;
grant execute on function rename_batch(int, text) to authenticated;

-- ===== update_5_users =====
-- Update 5: create users from Settings (admin only). Run after update_4 (or just run run_all_updates.sql).
-- Creates the login in Supabase Auth directly, so no secret key is ever needed in the browser.
create or replace function admin_create_user(p jsonb) returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare uname text := lower(trim(coalesce(p->>'username',''))); pw text := coalesce(p->>'password',''); r text := coalesce(p->>'role','teacher');
  em text; uid uuid := gen_random_uuid();
begin
  if my_role() is distinct from 'admin' then raise exception '403|Only an admin can create users'; end if;
  if uname !~ '^[a-z0-9._-]{2,40}$' then raise exception '422|Username must be 2-40 characters: letters, digits, dot, dash or underscore'; end if;
  if length(pw) < 8 then raise exception '422|Password must be at least 8 characters'; end if;
  if r not in ('admin','lab_assistant','teacher') then raise exception '422|Invalid role'; end if;
  em := uname || '@lab.local';
  if exists (select 1 from profiles where lower(username) = uname) or exists (select 1 from auth.users where lower(email) = em) then
    raise exception '409|Username already exists'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  -- the on_auth_user_created trigger already added a profile row; fill in the chosen details
  update profiles set username = uname, full_name = trim(coalesce(p->>'full_name','')), role = r,
    can_mark_attendance = coalesce((p->>'can_mark_attendance')::boolean, false) where id = uid;
  return (select to_jsonb(x) from (select id, username, full_name, role, can_mark_attendance, is_active from profiles where id = uid) x);
end $$;
revoke all on function admin_create_user(jsonb) from public, anon;
grant execute on function admin_create_user(jsonb) to authenticated;

-- ===== update_6_timetable_data =====
-- Update 6: Real data from Room TimeTable 1202 (Project Laboratory), AY 2026-27 Sem 1, W.E.F. 15-Sep-2026 to 10-Jan-2027.
-- Safe to run again: teachers/batches/divisions use ON CONFLICT; the timetable is re-created from scratch each time.

insert into batches(name) values ('B1'),('B2'),('B3') on conflict do nothing;
insert into divisions(name) values ('CS-A'),('CSAI-C'),('CSAI-D'),('CSAI-F'),('CSAIML-A'),('CSAIML-B'),('CSAIML-C'),('CSAIML-D'),('CSAIML-E'),('CSAIML-F') on conflict do nothing;

insert into teachers(name, teacher_code, department, designation, subjects, batches_text, remarks) values
  ('Pallavi Mohan Bhujbal', '12394', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B2', 'Short code: PMB'),
  ('Smita Hanmant Bhagwat', '20231', 'Engineering, Science and Humanities', 'Faculty', 'ES26205 - Engineering Robotics', 'B1, B2, B3', 'Short code: SHB'),
  ('Supriya Popat Mandhare', '12234', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B3', 'Short code: SPM'),
  ('Swati Mohan Patil', '12393', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B1, B2', 'Short code: SMP'),
  ('Sudarshan Jagdish Sikchi', '12391', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B2', 'Short code: SJS'),
  ('Sagar Gajanan Janokar', '11115', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B3', 'Short code: SGJ'),
  ('Dr. Sunil Satwaji Sable', '11898', 'Engineering, Science and Humanities', 'Faculty', 'ES26104 - Programming for Engineers', 'B1', 'Short code: SSS'),
  ('Mrs. Anita Shripad Joshi', '10349', 'Engineering, Science and Humanities', 'Faculty', 'ES26205 - Engineering Robotics', 'B1', 'Short code: ASJ'),
  ('Swati Nitin Shilaskar', '10562', 'Engineering, Science and Humanities', 'Faculty', 'ES26205 - Engineering Robotics', 'B1', 'Short code: SNS'),
  ('Dr. Chandrashekhar Madhavrao Mahajan', '10645', 'Engineering, Science and Humanities', 'Faculty', 'ES26205 - Engineering Robotics', 'B1, B2, B3', 'Short code: CMM'),
  ('Mrs. Suvarna Vijay Patil', '10911', 'Engineering, Science and Humanities', 'Faculty', 'ES26105 - Basics of Engineering', 'B2', 'Short code: SVP'),
  ('Dr. Mayuresh Vijay Bakshi', '20252', 'Engineering, Science and Humanities', 'Faculty', 'ES26205 - Engineering Robotics', 'B1, B2, B3', 'Short code: MVB')
on conflict (teacher_code) do update set name = excluded.name, department = excluded.department, subjects = excluded.subjects, batches_text = excluded.batches_text, designation = excluded.designation, remarks = excluded.remarks, is_active = true;

delete from timetable_entries where lab = 'Lab 1202';
insert into timetable_entries(day, time_from, time_to, batch, division, subject, teacher_id, lab, remarks)
select v.day, v.tf, v.tt, v.batch, v.division, v.subject, t.id, 'Lab 1202', 'Room 1202 Project Laboratory'
from (values
  ('Monday', '10:00', '12:00', 'B2', 'CSAIML-B', 'ES26205 - Engineering Robotics', '10645'),
  ('Monday', '12:00', '14:00', 'B2', 'CS-A', 'ES26105 - Basics of Engineering', '10911'),
  ('Monday', '14:00', '16:00', 'B2', 'CSAIML-C', 'ES26205 - Engineering Robotics', '20231'),
  ('Tuesday', '08:00', '10:00', 'B3', 'CSAIML-E', 'ES26104 - Programming for Engineers', '11115'),
  ('Tuesday', '10:00', '12:00', 'B1', 'CSAIML-B', 'ES26205 - Engineering Robotics', '10645'),
  ('Tuesday', '12:00', '14:00', 'B2', 'CSAI-D', 'ES26104 - Programming for Engineers', '12394'),
  ('Tuesday', '14:00', '16:00', 'B1', 'CSAIML-C', 'ES26205 - Engineering Robotics', '20231'),
  ('Tuesday', '16:00', '18:00', 'B1', 'CSAIML-D', 'ES26205 - Engineering Robotics', '20252'),
  ('Wednesday', '08:00', '10:00', 'B1', 'CSAIML-E', 'ES26104 - Programming for Engineers', '12393'),
  ('Wednesday', '10:00', '12:00', 'B3', 'CSAIML-B', 'ES26205 - Engineering Robotics', '10645'),
  ('Wednesday', '12:00', '14:00', 'B3', 'CSAI-F', 'ES26205 - Engineering Robotics', '20252'),
  ('Wednesday', '14:00', '16:00', 'B3', 'CSAIML-C', 'ES26205 - Engineering Robotics', '20231'),
  ('Wednesday', '16:00', '18:00', 'B3', 'CSAIML-F', 'ES26205 - Engineering Robotics', '10645'),
  ('Thursday', '08:00', '10:00', 'B2', 'CSAIML-E', 'ES26104 - Programming for Engineers', '12393'),
  ('Thursday', '10:00', '12:00', 'B2', 'CSAI-F', 'ES26104 - Programming for Engineers', '12391'),
  ('Thursday', '12:00', '14:00', 'B3', 'CSAI-F', 'ES26104 - Programming for Engineers', '12234'),
  ('Thursday', '14:00', '16:00', 'B1', 'CSAI-C', 'ES26205 - Engineering Robotics', '20252'),
  ('Thursday', '16:00', '18:00', 'B3', 'CSAIML-D', 'ES26205 - Engineering Robotics', '20252'),
  ('Friday', '08:00', '10:00', 'B2', 'CSAIML-E', 'ES26104 - Programming for Engineers', '12393'),
  ('Friday', '10:00', '12:00', 'B1', 'CSAIML-A', 'ES26205 - Engineering Robotics', '10562'),
  ('Friday', '12:00', '14:00', 'B3', 'CSAIML-E', 'ES26104 - Programming for Engineers', '11115'),
  ('Friday', '14:00', '16:00', 'B1', 'CSAIML-E', 'ES26205 - Engineering Robotics', '10349'),
  ('Friday', '16:00', '18:00', 'B1', 'CS-A', 'ES26104 - Programming for Engineers', '11898'),
  ('Saturday', '10:00', '12:00', 'B2', 'CSAIML-A', 'ES26205 - Engineering Robotics', '20252'),
  ('Saturday', '16:00', '18:00', 'B2', 'CSAI-C', 'ES26205 - Engineering Robotics', '20252')
) as v(day, tf, tt, batch, division, subject, tcode)
join teachers t on t.teacher_code = v.tcode;

-- ===== update_7_attendance =====
-- Update 7: batch-wise attendance. Run after update_6 (or just run run_all_updates.sql). Safe to run again.
-- Students now belong to a batch (B1/B2/B3) inside their division, and attendance is taken per timetable session.
alter table students add column if not exists batch text not null default '';
create index if not exists ix_students_div_batch on students(division, batch);

create table if not exists attendance_records (
  id serial primary key,
  student_id int not null references students on delete cascade,
  session_date date not null,
  division text not null,
  batch text not null default '',
  session_name text not null default '',                 -- e.g. '10:00-12:00' (timetable slot) or a free name for extra sessions
  timetable_id int references timetable_entries on delete set null,
  status text not null check (status in ('Present','Absent','Late','Leave')),
  marked_by uuid references profiles,
  updated_at timestamptz default now(),
  unique (student_id, session_date, session_name));
create index if not exists ix_att_date on attendance_records(session_date);

create or replace function can_mark_attendance() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('admin','lab_assistant') or can_mark_attendance from profiles where id = auth.uid() and is_active), false) $$;
grant execute on function can_mark_attendance() to authenticated;

alter table attendance_records enable row level security;
drop policy if exists "read attendance_records" on attendance_records;
drop policy if exists "write attendance_records" on attendance_records;
create policy "read attendance_records" on attendance_records for select to authenticated using (my_role() is not null);
create policy "write attendance_records" on attendance_records for all to authenticated using (can_mark_attendance()) with check (can_mark_attendance());

-- ===== update_8_inventory =====
-- Update 8: Inventory from Lab_Information.xlsx (+ daily-use items). Safe to run again, also if an older update_8 was already run.
-- total_qty = usable stock that can be issued. Reserved / not-working units are kept separately and are never issued.
-- daily_use = shown on the Issue Items page; every other item stays in Inventory only.
alter table inventory_items add column if not exists box_no text not null default '';
alter table inventory_items add column if not exists reserved_qty int not null default 0 check (reserved_qty >= 0);
alter table inventory_items add column if not exists not_working_qty int not null default 0 check (not_working_qty >= 0);
alter table inventory_items add column if not exists teacher_only boolean not null default false;
alter table inventory_items add column if not exists daily_use boolean not null default false;
alter table inventory_items add column if not exists notes text not null default '';

-- the view must be rebuilt so it picks up the new columns
drop view if exists inventory_view;
create view inventory_view with (security_invoker = true) as
  select i.*, coalesce(sum(t.qty - t.returned_qty), 0)::int as out_now
  from inventory_items i left join issue_transactions t on t.item_id = i.id group by i.id;
grant select on inventory_view to authenticated;

-- Teacher-only items (Full Kit) can be issued only when taken_by = 'Teacher'
create or replace function issue_items(p jsonb) returns text language plpgsql security definer set search_path = public as $$
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
  for it in select i.id, i.name, i.total_qty, i.teacher_only, sum((l->>'qty')::int) as need
            from jsonb_array_elements(p->'lines') l join inventory_items i on i.id = (l->>'item_id')::int
            group by i.id order by i.id loop
    select coalesce(sum(qty - returned_qty),0) into n from issue_transactions where item_id = it.id;
    avail := it.total_qty - n;
    if it.teacher_only and p->>'taken_by' <> 'Teacher' then raise exception '409|''%'' can only be issued to teachers', it.name; end if;
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

-- remove empty placeholder items (qty 0, never issued, no stock history)
delete from inventory_items i where i.total_qty = 0 and i.reserved_qty = 0
  and not exists (select 1 from issue_transactions t where t.item_id = i.id)
  and not exists (select 1 from stock_adjustments s where s.item_id = i.id);

-- friendlier names (keeps ids and issue history)
update inventory_items o set name = 'Arduino Uno Board' where o.name = 'Arduino' and not exists (select 1 from inventory_items x where x.name = 'Arduino Uno Board');
update inventory_items o set name = 'Male to Male Cables (MTM)' where o.name = 'MTM' and not exists (select 1 from inventory_items x where x.name = 'Male to Male Cables (MTM)');
update inventory_items o set name = 'Male to Female Cables (MTF)' where o.name = 'MTF' and not exists (select 1 from inventory_items x where x.name = 'Male to Female Cables (MTF)');
update inventory_items o set name = 'LED - Red' where o.name = 'Red' and not exists (select 1 from inventory_items x where x.name = 'LED - Red');
update inventory_items o set name = 'LED - Green' where o.name = 'Green' and not exists (select 1 from inventory_items x where x.name = 'LED - Green');
update inventory_items o set name = 'LED - Blue' where o.name = 'Blue' and not exists (select 1 from inventory_items x where x.name = 'LED - Blue');
update inventory_items o set name = 'LED - Yellow' where o.name = 'Yellow' and not exists (select 1 from inventory_items x where x.name = 'LED - Yellow');

insert into inventory_items(name, category, total_qty, reserved_qty, not_working_qty, box_no, teacher_only, daily_use, notes) values
  ('Full Kit', 'Kit', 7, 0, 0, '23', true, true, 'Box for teachers only (never issued to students)'),
  ('L293D Motor Driver Shield', 'Boards & Drivers', 7, 0, 0, '25', false, false, ''),
  ('3-Slot 18650 Battery Holder', 'Power', 6, 0, 0, '28', false, false, ''),
  ('Male to Male Cables (MTM)', 'Jumper Wires', 50, 129, 0, '30', false, true, '50 working, 129 reserved'),
  ('Male to Female Cables (MTF)', 'Jumper Wires', 50, 197, 0, '30', false, true, '50 working, 197 reserved'),
  ('Breadboard', 'Prototyping', 6, 0, 0, '', false, true, '6 in working'),
  ('2-Channel PC817 Optocoupler Isolation Module', 'Modules', 6, 0, 0, '', false, false, ''),
  ('HC-SR04 Ultrasonic Distance Sensor', 'Sensors', 7, 0, 0, '', false, true, ''),
  ('1-Channel 5V Relay Module', 'Modules', 6, 0, 0, '', false, false, ''),
  ('SG90 9g Micro Servo Motor', 'Motors', 6, 0, 0, '', false, false, ''),
  ('monolithic ceramic capacitors (MLCC)', 'Passive Components', 10, 0, 0, '', false, false, ''),
  ('LDR (Light Dependent Resistor)', 'Sensors', 6, 5, 0, '', false, true, '6 working, 5 reserved'),
  ('IR (Infrared) Obstacle Avoidance Sensor Module', 'Sensors', 7, 0, 0, '', false, true, ''),
  ('650nm Mini Red Laser Diode Module', 'Modules', 6, 0, 0, '', false, false, ''),
  ('Resistor', 'Passive Components', 34, 0, 0, '', false, true, ''),
  ('LED - Green', 'LEDs', 29, 0, 0, '', false, true, 'Green colour LED'),
  ('LED - Blue', 'LEDs', 30, 0, 0, '', false, true, 'Blue colour LED'),
  ('LED - Red', 'LEDs', 29, 0, 0, '', false, true, 'Red colour LED'),
  ('LED - Yellow', 'LEDs', 27, 0, 0, '', false, true, 'Yellow colour LED'),
  ('Buzzer', 'Audio', 6, 0, 1, '', false, true, '7 in total, 1 not working'),
  ('Arduino Uno Board', 'Boards & Drivers', 6, 0, 0, '', false, true, ''),
  ('Type C Cable', 'Cables', 6, 0, 0, '', false, true, ''),
  ('4-pin RGB LED', 'LEDs', 11, 0, 0, '', false, false, ''),
  ('push Button', 'Switches', 24, 0, 0, '', false, true, ''),
  ('130-Size Brushed DC Motor', 'Motors', 6, 0, 0, '', false, false, ''),
  ('Big register', 'Passive Components', 18, 0, 0, '', false, false, 'Sheet spelling ''register'' kept'),
  ('small blue register', 'Passive Components', 6, 0, 0, '', false, false, 'Sheet spelling ''register'' kept'),
  ('Toroidal Inductors', 'Passive Components', 6, 0, 0, '', false, false, ''),
  ('SMD Aluminum Electrolytic Capacitors', 'Passive Components', 6, 0, 0, '', false, false, ''),
  ('Rotary Potentiometer', 'Passive Components', 6, 0, 0, '', false, false, ''),
  ('KY-031 Knock / Percussion Sensor Module', 'Sensors', 6, 0, 0, '', false, false, ''),
  ('3 pin sensor module', 'Sensors', 6, 0, 0, '', false, false, ''),
  ('Axial Silicon Rectifier Diodes', 'Semiconductors', 12, 0, 0, '', false, false, ''),
  ('Glass Axial Diodes', 'Semiconductors', 12, 0, 0, '', false, false, ''),
  ('3 pin 292 package componenet', 'Semiconductors', 7, 0, 0, '', false, false, 'Name as written in the inventory sheet'),
  ('piezoelectric disc', 'Audio', 6, 0, 0, '', false, false, ''),
  ('16-Pin Straight Single-Row Male Pin Header Strip', 'Prototyping', 5, 0, 0, '', false, false, ''),
  ('Big register (2)', 'Passive Components', 20, 0, 0, '', false, false, 'Second ''big register'' row of the sheet (separate stock)'),
  ('HC-05 Bluetooth Serial Transceiver Module', 'Modules', 7, 0, 0, '', false, false, ''),
  ('4 digit 7 segment clock display', 'Displays', 5, 0, 0, '', false, false, '')
on conflict (name) do update set category = excluded.category, total_qty = excluded.total_qty, reserved_qty = excluded.reserved_qty,
  not_working_qty = excluded.not_working_qty, box_no = excluded.box_no, teacher_only = excluded.teacher_only, daily_use = excluded.daily_use, notes = excluded.notes;

grant execute on all functions in schema public to authenticated;
revoke execute on function admin_create_user(jsonb) from anon;
notify pgrst, 'reload schema';
