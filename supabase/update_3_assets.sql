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
