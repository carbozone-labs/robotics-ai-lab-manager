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

notify pgrst, 'reload schema';
